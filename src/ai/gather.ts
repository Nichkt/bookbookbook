import type { BookListRow } from "@/db/queries"
import type { Db } from "@/db/tx"
import { activeEditor, editorOf, type MountedEditor } from "@/editor/activeEditor"
import { openSceneDoc } from "@/editor/sceneDocs"
import { storedSceneReader } from "@/export/scenes"
import type { Codex } from "@/features/codex/codexData"
import type { Plan, PlanChapter } from "@/features/plan/planData"
import { proseForReading, SCENE_BREAK_TEXT } from "@/yjs/prose"
import { docFromState } from "@/yjs/versions"
import type { CardRequest, CardSelection } from "./cards"
import { cutEnd, cutStart, type ContextInput, type SlotId } from "./context"
import { locate, textBetween, type TextRange } from "./docText"
import {
  bookFacts,
  chapterFacts,
  linkedEntries,
  namesToAvoid,
  storySoFar,
  textsToMatch,
  voicesFor,
  worldFor,
} from "./facts"
import { NO_TEXT, type FieldValues, type ToolDef, type ToolText } from "./tools"

/*
 * Puts a request together (DESIGN.md §9 "Context assembly"): the writer's text around the caret or selection in the
 * scene they're in, or the whole chapter, and what facts.ts says about the book. Text from the scene editor is read
 * as it is this moment; the chapter's other scenes come from their live docs when open, else as stored.
 */

/** Between the scenes of a chapter's text. */
export const SCENE_JOIN = `\n\n${SCENE_BREAK_TEXT}\n\n`
/** Earlier scenes go before a short text only if this much room is left for them. */
const MIN_EARLIER = 200

export interface GatherSource {
  db: Db
  book: BookListRow
  plan: Plan
  codex: Codex
  /** The chapter Write shows: the one the tools read when there's no scene editor to go by. */
  chapterId: string
}

export interface GatherAsk {
  tool: ToolDef
  fields: FieldValues
  slotsOff: ReadonlySet<SlotId>
  contextTokens: number
  /** Retrying a card after a reload: the scene it ran in, and the text it was given to work on. */
  retry?: { sceneId: string | null; selection?: CardSelection }
}

export type Gathered =
  | { ok: false; problem: string }
  | { ok: true; input: ContextInput; request: CardRequest; sceneId: string | null }

const problem = (text: string): Gathered => ({ ok: false, problem: text })

export const SELECT_FIRST = "Select the text it should work on first."
export const DESCRIBE_FIRST = "Type what to describe, or select it in your text."
export const CLICK_FIRST = "Click in your text where it should go first."
export const EMPTY_CHAPTER = "This chapter has no text yet."
export const TEXT_CHANGED = "The text it worked on has changed since. Select it again and run the tool."

/** The scenes' text as the AI tools read it: live for the ones open here, so the last keystroke counts. */
async function sceneTexts(db: Db, sceneIds: readonly string[]): Promise<string[]> {
  const readStored = storedSceneReader(db)
  return Promise.all(
    sceneIds.map(async (sceneId) => {
      const live = openSceneDoc(sceneId)
      if (live) {
        await live.loaded
        return proseForReading(live.doc)
      }
      const doc = docFromState(await readStored(sceneId))
      try {
        return proseForReading(doc)
      } finally {
        doc.destroy()
      }
    }),
  )
}

export async function chapterText(db: Db, chapter: PlanChapter): Promise<string> {
  const texts = await sceneTexts(db, chapter.scenes.map((scene) => scene.id))
  return texts.filter((text) => text.trim() !== "").join(SCENE_JOIN)
}

const chapterOf = (plan: Plan, sceneId: string) =>
  plan.chapters.find((chapter) => chapter.scenes.some((scene) => scene.id === sceneId))

const windowStart = (text: string, size: number) => (size > 0 ? cutStart(text, size) : "")
const windowEnd = (text: string, size: number) => (size > 0 ? cutEnd(text, size) : "")

/** The text before the caret, after the chapter's earlier scenes when it's shorter than the tool reads. */
async function withEarlierScenes(
  db: Db,
  chapter: PlanChapter | null,
  sceneId: string,
  before: string,
  size: number,
): Promise<string> {
  const room = size - before.length - SCENE_JOIN.length
  if (!chapter || room < MIN_EARLIER) return before
  const index = chapter.scenes.findIndex((scene) => scene.id === sceneId)
  if (index <= 0) return before
  const texts = await sceneTexts(db, chapter.scenes.slice(0, index).map((scene) => scene.id))
  const earlier = texts.filter((text) => text.trim() !== "").join(SCENE_JOIN)
  return earlier ? `${cutStart(earlier, room)}${SCENE_JOIN}${before}` : before
}

interface Spot {
  mounted: MountedEditor
  range: TextRange
}

/** The scene editor and the range a tool works on: the writer's selection, or for a retry what it worked on before. */
function spotFor(ask: GatherAsk): Spot | string | null {
  const { retry } = ask
  if (retry?.selection) {
    const mounted = retry.sceneId ? editorOf(retry.sceneId) : undefined
    if (!mounted) return TEXT_CHANGED
    const { text, from, to } = retry.selection
    const range = locate(mounted.editor.state.doc, text, from, to)
    return range ? { mounted, range } : TEXT_CHANGED
  }
  const mounted = activeEditor()
  if (!mounted || mounted.editor.isDestroyed) return null
  const { from, to } = mounted.editor.state.selection
  return { mounted, range: { from, to } }
}

export async function gather(source: GatherSource, ask: GatherAsk): Promise<Gathered> {
  const { db, book, plan, codex } = source
  const { tool, fields } = ask
  const spot = spotFor(ask)
  if (typeof spot === "string") return problem(spot)
  const chapter = (spot && chapterOf(plan, spot.mounted.sceneId)) || plan.chapterById.get(source.chapterId) || null

  let text: ToolText = NO_TEXT
  let selection: CardSelection | undefined
  if (tool.input === "chapter") {
    const whole = chapter ? await chapterText(db, chapter) : ""
    if (!whole.trim()) return problem(EMPTY_CHAPTER)
    text = { ...NO_TEXT, chapter: whole }
  } else {
    const doc = spot ? spot.mounted.editor.state.doc : null
    const range = spot ? spot.range : null
    const selected = doc && range && range.from < range.to ? textBetween(doc, range.from, range.to) : ""
    const hasSelection = selected.trim() !== ""
    if (tool.input === "selection" && !hasSelection) return problem(SELECT_FIRST)
    if (tool.input === "subject" && !fields.subject?.trim() && !hasSelection) return problem(DESCRIBE_FIRST)
    if (tool.placement === "insert" && !doc) return problem(CLICK_FIRST)
    if (spot && doc && range) {
      // Tools that write at the caret work from the selection's end.
      const reads = tool.input === "selection" || (tool.input === "subject" && hasSelection)
      const from = reads ? range.from : range.to
      const to = range.to
      const before = windowStart(textBetween(doc, 0, from), tool.window.before)
      text = {
        before: await withEarlierScenes(db, chapter, spot.mounted.sceneId, before, tool.window.before),
        selection: reads ? selected : "",
        after: windowEnd(textBetween(doc, to, doc.content.size), tool.window.after),
        chapter: "",
      }
      if (reads && tool.placement === "replace") selection = { text: selected, from, to }
    }
  }

  const chapterInfo = chapter ? chapterFacts(chapter, codex) : null
  const world = worldFor(codex, textsToMatch(text, fields, chapterInfo), linkedEntries(chapter))
  const input: ContextInput = {
    tool,
    fields,
    book: bookFacts(book),
    chapter: chapterInfo,
    story: chapter ? storySoFar(plan.chapters, chapter.id) : [],
    always: world.always,
    mentioned: world.mentioned,
    voices: tool.voices ? voicesFor(codex, text.selection, chapter) : [],
    text,
    names: tool.output === "names" ? namesToAvoid(codex) : [],
    slotsOff: ask.slotsOff,
    contextTokens: ask.contextTokens,
  }
  const sceneId = spot?.mounted.sceneId ?? null
  const request: CardRequest = {
    tool: tool.id,
    toolName: tool.name,
    output: tool.output,
    placement: tool.placement,
    fields: { ...fields },
    sceneId,
    chapterId: chapter?.id ?? null,
    ...(selection ? { selection } : {}),
  }
  return { ok: true, input, request, sceneId }
}
