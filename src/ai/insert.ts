import { Fragment, Mark, Slice, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { AI_INSERT_META } from "@/editor/extensions/AiText"
import { AI_MARK } from "@/yjs/prose"
import { leafText, type TextRange } from "./docText"

/*
 * Puts an AI tool's prose into the writer's text (DESIGN.md §9 "Tools"): its paragraphs, scene breaks and the odd
 * bold or italic word, all with the AI mark, so it shows as AI-written until the writer makes it theirs (§8
 * "Provenance and stats").
 */

export type ProseBlock = { kind: "paragraph"; text: string } | { kind: "break" }

/** "* * *", "***", "---", "#" or "~~~" alone on a line: a scene break. */
const BREAK_LINE = /^(?:\*(?:\s*\*){2,}|-{3,}|_{3,}|~{3,}|#)$/

/** The answer's paragraphs, one per line, and its scene breaks, which never start or end it or come twice. */
export function proseBlocks(text: string): ProseBlock[] {
  const blocks: ProseBlock[] = []
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (BREAK_LINE.test(trimmed)) {
      if (blocks.length > 0 && blocks[blocks.length - 1].kind !== "break") blocks.push({ kind: "break" })
    } else {
      blocks.push({ kind: "paragraph", text: trimmed })
    }
  }
  while (blocks.length > 0 && blocks[blocks.length - 1].kind === "break") blocks.pop()
  return blocks
}

export interface Run {
  text: string
  bold: boolean
  italic: boolean
}

/** `***both***`, `**bold**`, `*italic*`, and `_italic_` standing apart from the words around it. */
const EMPHASIS = new RegExp(
  [
    String.raw`\*\*\*(?=\S)([^*]+?)(?<=\S)\*\*\*`,
    String.raw`\*\*(?=\S)([^*]+?)(?<=\S)\*\*`,
    String.raw`\*(?=\S)([^*]+?)(?<=\S)\*`,
    String.raw`(?<![\p{L}\p{N}_])_(?=\S)([^_]+?)(?<=\S)_(?![\p{L}\p{N}_])`,
  ].join("|"),
  "gu",
)

/** A paragraph's text in runs, its Markdown emphasis turned into bold and italic. */
export function inlineRuns(text: string): Run[] {
  const runs: Run[] = []
  let last = 0
  for (const match of text.matchAll(EMPHASIS)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), bold: false, italic: false })
    const [, both, bold, star, under] = match
    runs.push({
      text: both ?? bold ?? star ?? under,
      bold: both !== undefined || bold !== undefined,
      italic: both !== undefined || star !== undefined || under !== undefined,
    })
    last = match.index + match[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, italic: false })
  return runs
}

/** Whether a straight quote at `index` opens a quotation: it starts the text or follows a space or bracket. */
const opensAt = (text: string, index: number) => index === 0 || /[\s([{—–-]/.test(text[index - 1])

/** Whether text after `before` needs a space between them. */
export function spaceBefore(before: string, text: string): boolean {
  if (!before || !text) return false
  const last = before[before.length - 1]
  if (/[\s([{“‘—–-]/.test(last)) return false
  if ((last === '"' || last === "'") && opensAt(before, before.length - 1)) return false
  if (/^[.,;:!?)\]}”’…—–]/.test(text)) return false
  // A straight quote that closes the one before, as in `"Wait` + `," she said`.
  return !/^["'](?:[\s.,;:!?)\]}]|$)/.test(text)
}

/** Whether `after` needs a space between it and the text before it. */
export const spaceAfter = (text: string, after: string) => {
  if (!after || !text || /[\s([{“‘—–-]$/.test(text)) return false
  if (/^[\s.,;:!?)\]}”’…—–-]/.test(after)) return false
  return !/^["'](?:[\s.,;:!?)\]}]|$)/.test(after)
}

export interface AiMarkAttrs {
  /** The card the text came from. */
  card: string
  model: string
}

/** Where the text goes: the paragraph's text on either side, and whether that's in a paragraph at all. */
export interface Surroundings {
  before: string
  after: string
  inTextblock: boolean
}

export interface AiSlice {
  slice: Slice
  /** From the end of the slice back to the end of the AI's text, as a paragraph was added after it. */
  backFromEnd: number
}

/**
 * The text as a slice to replace `from`..`to` with: the AI's paragraphs, with spaces where they meet the writer's
 * text. Its first paragraph runs on from the text before, unless it starts with a line break (`startsParagraph`); its
 * last runs into the text after, unless that would start the writer's paragraph with it.
 */
export function aiSlice(
  schema: Schema,
  text: string,
  attrs: AiMarkAttrs,
  around: Surroundings,
  startsParagraph = false,
): AiSlice | null {
  const blocks = proseBlocks(text)
  if (blocks.length === 0) return null
  const ai = schema.marks[AI_MARK]?.create(attrs)
  const bold = schema.marks.bold
  const italic = schema.marks.italic
  const paragraph = schema.nodes.paragraph
  const rule = schema.nodes.horizontalRule

  const textNode = (run: Run) => {
    const marks: Mark[] = ai ? [ai] : []
    if (run.bold && bold) marks.push(bold.create())
    if (run.italic && italic) marks.push(italic.create())
    return schema.text(run.text, Mark.setFrom(marks))
  }
  const nodes: ProseMirrorNode[] = []
  const paragraphs = blocks.filter((block) => block.kind === "paragraph")
  const first = paragraphs[0]
  const last = paragraphs[paragraphs.length - 1]
  const newParagraph = startsParagraph && around.before.trim() !== ""
  const lead = around.inTextblock && !newParagraph && spaceBefore(around.before, first.text)
  const trail = around.inTextblock && spaceAfter(last.text, around.after)
  for (const block of blocks) {
    if (block.kind === "break") {
      if (rule) nodes.push(rule.create())
      continue
    }
    const content: ProseMirrorNode[] = inlineRuns(block.text).map(textNode)
    if (block === first && lead) content.unshift(schema.text(" "))
    if (block === last && trail) content.push(schema.text(" "))
    nodes.push(paragraph.create(null, content))
  }
  if (!around.inTextblock) return { slice: new Slice(Fragment.fromArray(nodes), 0, 0), backFromEnd: 0 }
  // A line break first: the text goes in a paragraph of its own, after the writer's.
  if (newParagraph) nodes.unshift(paragraph.create())
  // At the start of a paragraph, the text goes before it, not into it.
  const goesBefore = !around.before && around.after.trim() !== ""
  if (goesBefore) nodes.push(paragraph.create())
  return { slice: new Slice(Fragment.fromArray(nodes), 1, 1), backFromEnd: goesBefore ? 2 : 0 }
}

/** The paragraph's text on either side of a range. */
export function surroundings(doc: ProseMirrorNode, range: TextRange): Surroundings {
  const $from = doc.resolve(range.from)
  const $to = doc.resolve(range.to)
  const inTextblock = $from.parent.isTextblock && $to.parent.isTextblock
  if (!inTextblock) return { before: "", after: "", inTextblock }
  return {
    before: $from.parent.textBetween(0, $from.parentOffset, undefined, leafText),
    after: $to.parent.textBetween($to.parentOffset, $to.parent.content.size, undefined, leafText),
    inTextblock,
  }
}

/**
 * Replaces `range` with the AI's text (an empty range inserts it), as one step to undo, and puts the caret after it.
 * False when there's no text to put in.
 */
export function putAiText(view: EditorView, range: TextRange, text: string, attrs: AiMarkAttrs): boolean {
  const { state } = view
  const built = aiSlice(state.schema, text, attrs, surroundings(state.doc, range), text.startsWith("\n"))
  if (!built) return false
  const tr = state.tr.replace(range.from, range.to, built.slice)
  const end = Math.max(0, tr.mapping.map(range.to, 1) - built.backFromEnd)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1))
  tr.setMeta(AI_INSERT_META, true)
  tr.scrollIntoView()
  view.dispatch(tr)
  return true
}
