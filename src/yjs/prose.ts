import * as Y from "yjs"

/** The Y.XmlFragment that TipTap's Collaboration extension binds to (`field` option). */
export const PROSE_FIELD = "prose"

/**
 * The mark on text an AI tool wrote (DESIGN.md §8 "Provenance and stats"). y-tiptap stores it as a Y.Text attribute
 * of the same name, whose value is the mark's attributes.
 */
export const AI_MARK = "aiGenerated"

/** Whether a Y.Text attribute is the AI mark. y-prosemirror names a mark that may overlap itself `name--hash`. */
export const isAiAttribute = (key: string) => key === AI_MARK || key.startsWith(`${AI_MARK}--`)

/** Encodes paragraphs of plain text as a fresh scene doc, in the shape TipTap's Collaboration extension reads. */
export function proseState(paragraphs: string[]): Uint8Array {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(PROSE_FIELD)
  doc.transact(() => {
    paragraphs.forEach((text, index) => {
      const paragraph = new Y.XmlElement("paragraph")
      fragment.insert(index, [paragraph])
      if (text) paragraph.insert(0, [new Y.XmlText(text)])
    })
  })
  const state = Y.encodeStateAsUpdateV2(doc)
  doc.destroy()
  return state
}

/** Plain text of each top-level block of a scene doc, as `proseText` gives them. */
export function proseParagraphs(doc: Y.Doc): string[] {
  return doc
    .getXmlFragment(PROSE_FIELD)
    .toArray()
    .map((node) => textOf(node))
}

/** Plain text of a scene doc: blocks and line breaks become newlines. */
export function proseText(doc: Y.Doc): string {
  return proseParagraphs(doc).join("\n")
}

/** A scene break as the AI tools read and write it. */
export const SCENE_BREAK_TEXT = "* * *"

/**
 * A scene doc's text as the AI tools read it (DESIGN.md §9): blocks apart by a blank line, a scene break as "* * *",
 * and empty paragraphs left out.
 */
export function proseForReading(doc: Y.Doc): string {
  return doc
    .getXmlFragment(PROSE_FIELD)
    .toArray()
    .map((node) =>
      node instanceof Y.XmlElement && node.nodeName === "horizontalRule" ? SCENE_BREAK_TEXT : textOf(node),
    )
    .filter((text) => text.trim() !== "")
    .join("\n\n")
}

function textOf(node: Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as { insert: unknown }[]).map((op) => (typeof op.insert === "string" ? op.insert : "")).join("")
  }
  if (!(node instanceof Y.XmlElement)) return ""
  if (node.nodeName === "hardBreak") return "\n"
  const children = node.toArray()
  // Text runs join directly; nested blocks (quotes, list items) go on their own lines.
  const holdsBlocks = children.some((child) => child instanceof Y.XmlElement && child.nodeName !== "hardBreak")
  return children.map(textOf).join(holdsBlocks ? "\n" : "")
}

export interface ProseCounts {
  /** As `countWords(proseText(doc))` counts them. */
  words: number
  /** The words still marked as an AI tool's: those with more than half their characters in AI text. */
  aiWords: number
}

interface Run {
  text: string
  ai: boolean
}

const LINE_BREAK: Run = { text: "\n", ai: false }

/** The doc's text in runs, laid out as `proseText` lays it out. */
function runsOf(node: Y.XmlElement | Y.XmlText | Y.XmlHook, runs: Run[]) {
  if (node instanceof Y.XmlText) {
    for (const op of node.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
      if (typeof op.insert !== "string") continue
      const attributes = op.attributes ?? {}
      const ai = Object.keys(attributes).some((key) => isAiAttribute(key) && attributes[key] != null)
      runs.push({ text: op.insert, ai })
    }
    return
  }
  if (!(node instanceof Y.XmlElement)) return
  if (node.nodeName === "hardBreak") {
    runs.push(LINE_BREAK)
    return
  }
  const children = node.toArray()
  const holdsBlocks = children.some((child) => child instanceof Y.XmlElement && child.nodeName !== "hardBreak")
  children.forEach((child, index) => {
    if (holdsBlocks && index > 0) runs.push(LINE_BREAK)
    runsOf(child, runs)
  })
}

/** A scene doc's words, and how many of them an AI tool wrote (DESIGN.md §8 "Provenance and stats"). */
export function proseCounts(doc: Y.Doc): ProseCounts {
  const runs: Run[] = []
  doc
    .getXmlFragment(PROSE_FIELD)
    .toArray()
    .forEach((node, index) => {
      if (index > 0) runs.push(LINE_BREAK)
      runsOf(node, runs)
    })
  const text = runs.map((run) => run.text).join("")
  const marked = new Uint8Array(text.length)
  let offset = 0
  for (const run of runs) {
    if (run.ai) marked.fill(1, offset, offset + run.text.length)
    offset += run.text.length
  }
  let words = 0
  let aiWords = 0
  // The same tokens as countWords's split on whitespace.
  for (const match of text.matchAll(/\S+/g)) {
    const token = match[0]
    if (!/[\p{L}\p{N}]/u.test(token)) continue
    words++
    let ai = 0
    for (let at = match.index; at < match.index + token.length; at++) ai += marked[at]
    if (ai * 2 > token.length) aiWords++
  }
  return { words, aiWords }
}
