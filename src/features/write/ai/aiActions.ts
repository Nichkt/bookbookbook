import type { Editor } from "@tiptap/react"
import { toast } from "sonner"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { clearCards, dismissCard, markUsed, type Card } from "@/ai/cards"
import { buildPrompt, type SlotId } from "@/ai/context"
import { locate } from "@/ai/docText"
import { CLICK_FIRST, gather, type GatherAsk, type GatherSource } from "@/ai/gather"
import { putAiText } from "@/ai/insert"
import type { Group } from "@/ai/parse"
import { isRunning, retryRun, startRun, stopRun } from "@/ai/runs"
import type { Connection } from "@/ai/settings"
import { toolById, type FieldValues, type ToolDef } from "@/ai/tools"
import type { Db } from "@/db/tx"
import { activeEditor, editorOf, whenEditor, type MountedEditor } from "@/editor/activeEditor"
import { chapterName } from "@/features/plan/commands"
import { appendBeats, replaceChapterText } from "@/features/plan/mutations"
import type { Plan } from "@/features/plan/planData"
import { byData } from "@/lib/focus"
import { holdInView } from "../pageHooks"
import { chapterOfScene, sceneNameIn, writePath, type WriteUnit } from "../writeContext"

/*
 * What the AI panel's buttons do (DESIGN.md §9 "Tools"): run a tool, and put what comes back into the text or the
 * plan. Text goes in with the AI mark (insert.ts), as one step to undo; plan edits offer Undo.
 */

/** What a run reads: the book, and how the writer has the AI tools set up. */
export interface RunSource extends GatherSource {
  connection: Connection
  slotsOff: ReadonlySet<SlotId>
}

export type RunResult = { ok: true; cardId: string } | { ok: false; problem: string }

export const TOO_BIG =
  "That's more than the AI can read at once. Select less text, or let it read more in AI settings."
export const TOOL_GONE = "That tool has been deleted, so it can't run again."
export const SCENE_GONE = "The scene it worked on is gone."

/** Puts a request together from the text and the book, and starts it. */
export async function runTool(
  source: RunSource,
  tool: ToolDef,
  fields: FieldValues,
  retry?: GatherAsk["retry"],
): Promise<RunResult> {
  const { db, book, connection, slotsOff } = source
  const gathered = await gather(source, { tool, fields, slotsOff, contextTokens: connection.contextTokens, retry })
  if (!gathered.ok) return gathered
  const prompt = buildPrompt(gathered.input)
  if (prompt.tooBig) return { ok: false, problem: TOO_BIG }
  const cardId = await startRun({
    db,
    bookId: book.id,
    connection,
    prompt: { system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens },
    variants: tool.variants,
    request: gathered.request,
    trimmed: prompt.trimmed,
  })
  return { ok: true, cardId }
}

/** Runs a card's request again, as a new card: as it was sent while that can be, else put together afresh. */
export async function retryCard(source: RunSource, card: Card, custom: readonly ToolDef[]): Promise<RunResult> {
  const again = await retryRun(source.db, source.book.id, card.id, source.connection)
  if (again) return { ok: true, cardId: again }
  const { request } = card.output
  const tool = toolById(request.tool, custom)
  if (!tool) return { ok: false, problem: TOOL_GONE }
  const { sceneId, selection } = request
  if (!selection) return runTool(source, tool, request.fields)
  // It worked on text the writer selected: that text again, where it was.
  if (!sceneId || !chapterOfScene(source.plan, sceneId)) return { ok: false, problem: SCENE_GONE }
  if (!editorOf(sceneId)) return { ok: false, problem: `Go to ${sceneNameIn(source.plan, sceneId)} to run it again.` }
  return runTool(source, tool, request.fields, { sceneId, selection })
}

export async function stopAndDismiss(db: Db, card: Card) {
  stopRun(card.id)
  await attempt("dismiss result", dismissCard(db, card.id))
}

/** Clears the panel's results, with Undo. Their runs stop. */
export async function clearResults(db: Db, bookId: string, cards: readonly Card[]) {
  for (const card of cards) if (isRunning(card.id)) stopRun(card.id)
  const changes = await attempt("clear results", clearCards(db, bookId))
  if (changes) offerUndo(db, "Cleared the results.", changes)
}

/** What the actions need of the Write screen. */
export interface AiPage {
  db: Db
  bookId: string
  plan: Plan
  unit: WriteUnit
  chapterId: string
  panelDocked: boolean
  closePanelTo: (editor: Editor) => void
  /** Goes to a page of the Write screen at once, not as a transition. */
  navigate: (path: string) => void
}

/** Back to the text after putting something in: beside a docked panel, else closing the sheet over it. */
function backToText(page: AiPage, editor: Editor) {
  if (page.panelDocked) editor.view.focus()
  else page.closePanelTo(editor)
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast("Copied.")
  } catch {
    toast.error("Couldn't copy it. Select the text and copy it from there instead.")
  }
}

/** Groups as text to copy: each heading, then its items. */
export const groupsText = (groups: readonly Group[]) =>
  groups.map((group) => [`${group.heading}:`, ...group.items.map((item) => `- ${item}`)].join("\n")).join("\n\n")

/**
 * Puts text in at the caret, in the scene the writer was last in. `variant` is the answer it came from, so the card
 * can say it was used; null for a line from a list.
 */
export function insertAtCaret(page: AiPage, card: Card, variant: number | null, text: string): boolean {
  const mounted = activeEditor()
  if (!mounted || mounted.editor.isDestroyed) {
    toast(CLICK_FIRST)
    return false
  }
  const { editor } = mounted
  const at = editor.state.selection.to
  if (!putAiText(editor.view, { from: at, to: at }, text, { card: card.id, model: card.model })) return false
  if (variant !== null) void attempt("note insert", markUsed(page.db, card.id, variant))
  announce("Inserted.")
  backToText(page, editor)
  return true
}

let stopWaiting: (() => void) | null = null
/** How long Replace waits for a scene it went to to come onto the page. */
const ARRIVAL_MS = 5000

/** Replaces the text a tool worked on with an answer, going to its scene if it isn't on the page. */
export function replaceOriginal(page: AiPage, card: Card, variant: number, text: string) {
  const { sceneId, selection } = card.output.request
  if (!sceneId || !selection) {
    insertAtCaret(page, card, variant, text)
    return
  }
  stopWaiting?.()
  stopWaiting = null
  const chapter = chapterOfScene(page.plan, sceneId)
  if (!chapter) {
    toast(SCENE_GONE)
    return
  }

  const replace = ({ editor }: MountedEditor) => {
    if (editor.isDestroyed) return
    const range = locate(editor.state.doc, selection.text, selection.from, selection.to)
    if (!range) {
      toast("The text it worked on has changed since, so it's not there to replace.", {
        action: { label: "Copy", onClick: () => void copyText(text) },
      })
      return
    }
    if (!putAiText(editor.view, range, text, { card: card.id, model: card.model })) return
    void attempt("note replace", markUsed(page.db, card.id, variant))
    announce("Replaced.")
    backToText(page, editor)
  }

  const mounted = editorOf(sceneId)
  if (mounted) {
    replace(mounted)
    return
  }
  // Its scene is elsewhere: go there, and replace once its text is on the page.
  let release = () => {}
  let cancel = () => {}
  const stop = () => {
    window.clearTimeout(timer)
    cancel()
    release()
    if (stopWaiting === stop) stopWaiting = null
  }
  const timer = window.setTimeout(() => {
    stop()
    toast(`Couldn't get to ${sceneNameIn(page.plan, sceneId)}. Go to it, then try again.`)
  }, ARRIVAL_MS)
  stopWaiting = stop
  if (page.unit === "manuscript") release = holdInView(byData("scene-id", sceneId))
  else if (page.unit === "scene") page.navigate(writePath(page.bookId, chapter.id, sceneId))
  else if (chapter.id !== page.chapterId) page.navigate(writePath(page.bookId, chapter.id))
  cancel = whenEditor(sceneId, (entry) => {
    stop()
    // After the page's own arrival, which scrolls to its top.
    requestAnimationFrame(() => replace(entry))
  })
}

/** The chapter a card's plan actions go to: the one it ran in, while it's still in the book. */
export function chapterFor(page: Pick<AiPage, "plan" | "chapterId">, card: Card) {
  const { chapterId } = card.output.request
  return page.plan.chapterById.get(chapterId ?? page.chapterId) ?? null
}

export async function addMoments(page: AiPage, card: Card, texts: readonly string[]) {
  const chapter = chapterFor(page, card)
  if (!chapter) {
    toast("The chapter it ran in is gone.")
    return
  }
  const changes = await attempt("add moments", appendBeats(page.db, chapter.id, texts))
  if (!changes) return
  const what = texts.length === 1 ? "a moment" : `${texts.length} moments`
  offerUndo(page.db, `Added ${what} to ${chapterName(chapter)}.`, changes)
}

export async function setChapterText(page: AiPage, card: Card, patch: { summary: string } | { title: string }) {
  const chapter = chapterFor(page, card)
  if (!chapter) {
    toast("The chapter it ran in is gone.")
    return
  }
  const changes = await attempt("update chapter", replaceChapterText(page.db, chapter.id, patch))
  if (!changes) return
  const what = "summary" in patch ? "summary" : "title"
  offerUndo(page.db, `Changed the ${what} of ${chapterName(chapter)}.`, changes)
}
