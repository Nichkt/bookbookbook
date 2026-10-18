import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"
import { toast } from "sonner"
import * as Y from "yjs"
import { create } from "zustand"
import { announce, reportError, UNDO_MS } from "@/app/feedback"
import type { Db } from "@/db/tx"
import { saveVersion } from "@/db/versions"
import { activeEditor, editorOf, useEditors, whenEditor, type MountedEditor } from "@/editor/activeEditor"
import { currentFind, showFind } from "@/editor/extensions/FindHighlight"
import {
  compileFind,
  docMatches,
  expandReplacement,
  matchesIn,
  pmRuns,
  replaceAllInDoc,
  yRuns,
  type CompiledFind,
  type FindOptions,
  type PmRun,
} from "@/editor/find"
import { acquireSceneDoc, onSceneEdit, openSceneDoc, releaseSceneDoc } from "@/editor/sceneDocs"
import { storedSceneReader, type SceneReader } from "@/export/scenes"
import type { Plan } from "@/features/plan/planData"
import { byData, focusSoon } from "@/lib/focus"
import { IS_MAC } from "@/lib/keys"
import { formatCount } from "@/lib/numbers"
import { PROSE_FIELD } from "@/yjs/prose"
import type { SceneDocProvider } from "@/yjs/SceneDocProvider"
import { docFromState } from "@/yjs/versions"
import { bookResults, sceneOrder, seedQuery, stepIndex, type FindTarget, type SceneTexts } from "./findData"
import { holdInView } from "./pageHooks"
import { chapterOfScene, writePath, type WriteContextValue, type WriteUnit } from "./writeContext"

/*
 * Find and replace across the book (DESIGN.md §8 "Writing aids"): the panel's search, the scenes' text it searches,
 * and what its buttons do to the text.
 */

export const FIND_PANEL = "[data-find-panel]"
export const FIND_INPUT = "[data-find-input]"
export const FIND_KEYS = "Mod+Shift+F"

/** Ctrl+Shift+F, or ⌘⇧F on a Mac. */
export const isFindShortcut = (event: KeyboardEvent) =>
  (IS_MAC ? event.metaKey : event.ctrlKey) &&
  event.shiftKey &&
  !event.altKey &&
  (event.code === "KeyF" || event.key.toLowerCase() === "f")

interface FindState extends FindOptions {
  replacement: string
  /** The match the panel is on. */
  current: FindTarget | null
  /** The book's scenes' text, run by run (see yRuns): read as the panel opens, and again after each edit. */
  texts: SceneTexts
  /** While Replace all works. */
  busy: boolean
}

export const useFind = create<FindState>(() => ({
  query: "",
  matchCase: false,
  wholeWord: false,
  pattern: false,
  replacement: "",
  current: null,
  texts: new Map(),
  busy: false,
}))

/** A new search starts on no match. */
export const setFindQuery = (query: string) => useFind.setState({ query, current: null })
export type FindOption = "matchCase" | "wholeWord" | "pattern"
export const setFindOption = (option: FindOption, on: boolean) =>
  useFind.setState({ [option]: on, current: null } as Partial<FindState>)
export const setReplacement = (replacement: string) => useFind.setState({ replacement })

let compiled: { key: string; search: CompiledFind | null } | null = null

/** The search the panel's settings make: the same one, and so the same RegExp, until they change. */
export function searchOf({ query, matchCase, wholeWord, pattern }: FindOptions): CompiledFind | null {
  const key = `${+matchCase}${+wholeWord}${+pattern}${query}`
  if (compiled?.key !== key) compiled = { key, search: compileFind({ query, matchCase, wholeWord, pattern }) }
  return compiled.search
}

const currentRegex = () => searchOf(useFind.getState())?.regex ?? null

const runTexts = (doc: Y.Doc) => yRuns(doc).map((run) => run.text)

/** Marks a new search's matches in the editors on the page, with none of them current yet. */
export function showSearch(regex: RegExp | null) {
  for (const { editor } of useEditors.getState().mounted) showFind(editor, { regex, current: null })
}

/** Marks the search in an editor that's come onto the page, with the current match if it's in its scene. */
export function showSearchIn({ editor, sceneId }: MountedEditor) {
  const regex = currentRegex()
  const { current } = useFind.getState()
  const range =
    regex && current?.sceneId === sceneId
      ? (docMatches(editor.state.doc, regex, current.ordinal + 1).at(current.ordinal) ?? null)
      : null
  showFind(editor, { regex, current: range })
}

/** How long after an edit its scene is read again. */
const EDIT_DELAY_MS = 250

let session: { db: Db; read: SceneReader } | null = null
let readCount = 0
/** Each scene's latest read, so one that finishes after a newer one is dropped. */
const reads = new Map<string, number>()
const pending = new Set<string>()
const editTimers = new Map<string, number>()
/** Whether the panel went to the current match, so closing the panel from there goes to it too. */
let returnToMatch = false

/** Starts finding as the panel opens: the book's text is read, and kept up with edits. Returns what ends it. */
export function startFindSession(db: Db): () => void {
  const mine = { db, read: storedSceneReader(db) }
  session = mine
  const stopEdits = onSceneEdit((sceneId) => {
    window.clearTimeout(editTimers.get(sceneId))
    const timer = window.setTimeout(() => {
      editTimers.delete(sceneId)
      refreshScene(sceneId)
    }, EDIT_DELAY_MS)
    editTimers.set(sceneId, timer)
  })
  // Into the text, the writer is somewhere else than the panel's match.
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Element && event.target.closest(".ProseMirror")) returnToMatch = false
  }
  document.addEventListener("focusin", onFocusIn)
  return () => {
    stopEdits()
    document.removeEventListener("focusin", onFocusIn)
    if (session !== mine) return
    session = null
    for (const timer of editTimers.values()) window.clearTimeout(timer)
    editTimers.clear()
    reads.clear()
    pending.clear()
    cancelReveal()
    stopWaitingForRead?.()
    returnToMatch = false
    useFind.setState({ texts: new Map(), current: null })
    for (const { editor } of useEditors.getState().mounted) showFind(editor, { regex: null, current: null })
  }
}

function startRead(sceneId: string) {
  const at = ++readCount
  reads.set(sceneId, at)
  return at
}

interface SceneRead {
  sceneId: string
  at: number
  runs: readonly string[]
}

function setRuns(read: readonly SceneRead[]) {
  const fresh = read.filter(({ sceneId, at }) => reads.get(sceneId) === at)
  if (fresh.length === 0) return
  const texts = new Map(useFind.getState().texts)
  for (const { sceneId, runs } of fresh) texts.set(sceneId, runs)
  useFind.setState({ texts })
}

/** A scene's text: from its live doc when it's open, which may have edits not yet stored, else as stored. */
async function readRuns(read: SceneReader, sceneId: string): Promise<string[]> {
  const live = openSceneDoc(sceneId)
  if (live) {
    await live.loaded
    return runTexts(live.doc)
  }
  const doc = docFromState(await read(sceneId))
  try {
    return runTexts(doc)
  } finally {
    doc.destroy()
  }
}

/** Reads the scenes not read yet, all at once. */
export async function loadSceneTexts(sceneIds: readonly string[]) {
  const mine = session
  if (!mine) return
  const { texts } = useFind.getState()
  const missing = sceneIds.filter((sceneId) => !texts.has(sceneId) && !pending.has(sceneId))
  if (missing.length === 0) return
  for (const sceneId of missing) pending.add(sceneId)
  const read = await Promise.all(
    missing.map(async (sceneId): Promise<SceneRead> => {
      const at = startRead(sceneId)
      try {
        return { sceneId, at, runs: await readRuns(mine.read, sceneId) }
      } catch (error) {
        console.error(`[find] Couldn't read scene ${sceneId}`, error)
        return { sceneId, at, runs: [] }
      }
    }),
  )
  if (session !== mine) return
  for (const sceneId of missing) pending.delete(sceneId)
  setRuns(read)
}

/**
 * Reads a scene again after an edit: at once from its live doc, which is loaded if it's been edited, else as stored.
 * The current match, if it's in the scene, keeps its place in the scene's list as its editor follows it.
 */
export function refreshScene(sceneId: string) {
  const mine = session
  if (!mine) return
  const at = startRead(sceneId)
  const live = openSceneDoc(sceneId)
  if (live) {
    setRuns([{ sceneId, at, runs: runTexts(live.doc) }])
  } else {
    readRuns(mine.read, sceneId).then(
      (runs) => session === mine && setRuns([{ sceneId, at, runs }]),
      (error: unknown) => console.error(`[find] Couldn't read scene ${sceneId}`, error),
    )
  }
  followCurrent(sceneId)
}

function followCurrent(sceneId: string) {
  const { current } = useFind.getState()
  const regex = currentRegex()
  const entry = current?.sceneId === sceneId ? editorOf(sceneId) : undefined
  if (!current || !regex || !entry) return
  // Edited so it's no longer a match, it's no longer current.
  const range = currentFind(entry.editor.state)
  const ordinal = range ? docMatches(entry.editor.state.doc, regex).findIndex((match) => match.from === range.from) : -1
  if (ordinal === -1) useFind.setState({ current: null })
  else if (ordinal !== current.ordinal) useFind.setState({ current: { sceneId, ordinal } })
}

/** What going to a match needs of the Write screen. */
export interface FindPage {
  bookId: string
  plan: Plan
  unit: WriteUnit
  chapterId: string
  sceneId: string | null
  panelDocked: boolean
  /**
   * Goes to a chapter or scene, the page changing before this returns: a later press, coming before a transition
   * would have drawn it, then starts from the page it's on, and isn't undone by the page arriving after it.
   */
  navigate: (path: string) => void
  /** Closes the panel, focus going to the editor. */
  closePanelTo: (editor: Editor) => void
}

export type MatchPlace = FindTarget & { chapterId: string }

/** How long a match's scene may take to come up on the page. */
const ARRIVE_MS = 5000
/** Room kept between a match scrolled to and the toolbar, or the window's foot. */
const MARGIN = 24

let revealing = 0
let arriveTimer = 0
let stopWaiting: (() => void) | null = null
let releaseHold: (() => void) | null = null

function cancelReveal() {
  revealing++
  window.clearTimeout(arriveTimer)
  stopWaiting?.()
  stopWaiting = null
  releaseHold?.()
  releaseHold = null
}

/** Scrolls the current match, if it's out of sight, to a third of the way down the text's part of the window. */
function scrollToMatch(editor: Editor) {
  const range = editor.isDestroyed ? null : currentFind(editor.state)
  if (!range) return
  const top = (document.querySelector("[data-write-toolbar]")?.getBoundingClientRect().bottom ?? 0) + MARGIN
  const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--toast-bottom"))
  const bottom = window.innerHeight - (Number.isFinite(offset) ? offset : 0) - MARGIN
  const start = editor.view.coordsAtPos(range.from, 1)
  const end = editor.view.coordsAtPos(range.to, -1)
  if (start.top >= top && end.bottom <= bottom) return
  window.scrollBy({ top: start.top - (top + (bottom - top) / 3), behavior: "instant" })
}

/**
 * Makes a match the current one and shows it, going to its chapter or scene when it isn't on the page. With
 * "select", the text selects it and takes focus, closing the panel if it's a sheet over the text.
 */
export function revealMatch(page: FindPage, target: MatchPlace, mode: "show" | "select") {
  const regex = currentRegex()
  if (!regex) return
  cancelReveal()
  const id = revealing
  const { sceneId, chapterId, ordinal } = target
  useFind.setState({ current: { sceneId, ordinal } })
  for (const entry of useEditors.getState().mounted) {
    if (entry.sceneId !== sceneId) showFind(entry.editor, { current: null })
  }
  returnToMatch = mode === "show"

  const arrive = ({ editor }: MountedEditor, moved: boolean) => {
    if (editor.isDestroyed) return
    const range = docMatches(editor.state.doc, regex, ordinal + 1).at(ordinal) ?? null
    showFind(editor, { regex, current: range })
    if (!range) return
    const scroll = () => scrollToMatch(editor)
    releaseHold?.()
    releaseHold = null
    // Arrived from elsewhere, the scenes around it are still taking their height.
    if (moved) releaseHold = holdInView(scroll)
    else scroll()
    if (mode === "show") return
    editor.commands.setTextSelection(range)
    if (page.panelDocked) editor.view.focus()
    else page.closePanelTo(editor)
  }

  const mounted = editorOf(sceneId)
  if (mounted) return arrive(mounted, false)
  if (page.unit === "manuscript") {
    // Its text loads as it nears the window.
    releaseHold = holdInView(byData("scene-id", sceneId))
  } else if (page.unit === "scene") {
    if (sceneId !== page.sceneId || chapterId !== page.chapterId) page.navigate(writePath(page.bookId, chapterId, sceneId))
  } else if (chapterId !== page.chapterId) {
    page.navigate(writePath(page.bookId, chapterId))
  }
  stopWaiting = whenEditor(sceneId, (entry) => {
    stopWaiting = null
    window.clearTimeout(arriveTimer)
    // After the page's own arrival, which scrolls to its top.
    requestAnimationFrame(() => {
      if (id === revealing) arrive(entry, true)
    })
  })
  arriveTimer = window.setTimeout(() => {
    if (id === revealing) cancelReveal()
  }, ARRIVE_MS)
}

/** Where the writer is: the caret's scene, and how many of its matches come before the caret. Else the chapter's start. */
function placeOf(page: FindPage, regex: RegExp, step: 1 | -1): FindTarget | null {
  const entry = activeEditor()
  if (entry && !entry.editor.isDestroyed) {
    const { from, to } = entry.editor.state.selection
    // Going on from a selection goes past it; going back, before it.
    const edge = step > 0 ? to : from
    const ordinal = docMatches(entry.editor.state.doc, regex).filter((match) => match.from < edge).length
    return { sceneId: entry.sceneId, ordinal }
  }
  const first = page.plan.chapterById.get(page.chapterId)?.scenes[0]
  return first ? { sceneId: first.id, ordinal: 0 } : null
}

/** Goes to the next match (1) or the one before (-1), from the current one or else the caret, round the book. */
export function stepMatch(page: FindPage, step: 1 | -1) {
  whenRead(page, () => {
    const regex = currentRegex()
    if (!regex) return
    const { texts, current } = useFind.getState()
    const { matches } = bookResults(page.plan, texts, regex)
    const place = current ? null : placeOf(page, regex, step)
    const index = stepIndex(matches, sceneOrder(page.plan), current, place, step)
    if (index !== -1) revealMatch(page, matches[index], "show")
  })
}

/** Next, Previous or Replace pressed while the panel says "Searching…", waiting for the rest of the book. */
let stopWaitingForRead: (() => void) | null = null

/**
 * Does `action` once every scene has been read, which is usually at once. Pressed while the panel still says
 * "Searching…", Next or Replace goes once it's done, by every match in the book rather than those read so far. A newer
 * press takes the place of a waiting one.
 */
function whenRead(page: FindPage, action: () => void) {
  stopWaitingForRead?.()
  const read = () => {
    const regex = currentRegex()
    return !regex || !bookResults(page.plan, useFind.getState().texts, regex).partial
  }
  if (read()) return action()
  const stop = () => {
    unsubscribe()
    if (stopWaitingForRead === stop) stopWaitingForRead = null
  }
  const unsubscribe = useFind.subscribe(() => {
    if (!read()) return
    stop()
    action()
  })
  stopWaitingForRead = stop
}

/** The search's match that starts at a position in an editor's document. */
function matchAt(doc: ProseMirrorNode, regex: RegExp, pos: number): RegExpExecArray | undefined {
  let run: PmRun | undefined
  for (const candidate of pmRuns(doc)) {
    if (candidate.pos > pos) break
    run = candidate
  }
  if (!run) return undefined
  const offset = pos - run.pos
  return matchesIn(run.text, regex).find((match) => match.index === offset)
}

/**
 * Replaces the current match, as an edit Ctrl+Z undoes, then goes on to the next. With no match current, goes to the
 * next to replace instead.
 */
export function replaceCurrent(page: FindPage) {
  whenRead(page, () => replaceNow(page))
}

function replaceNow(page: FindPage) {
  const regex = currentRegex()
  if (!regex) return
  const { current, replacement, pattern } = useFind.getState()
  const entry = current ? editorOf(current.sceneId) : undefined
  // Scrolled or gone off the page, it's brought back first, to be replaced next time.
  const chapterOfCurrent = current && !entry ? chapterOfScene(page.plan, current.sceneId) : undefined
  if (current && chapterOfCurrent) return revealMatch(page, { ...current, chapterId: chapterOfCurrent.id }, "show")
  const range = entry ? currentFind(entry.editor.state) : null
  const match = entry && range ? matchAt(entry.editor.state.doc, regex, range.from) : undefined
  if (!current || !entry || !range || !match) return stepMatch(page, 1)

  const { editor } = entry
  const { state } = editor
  const text = expandReplacement(replacement, match, pattern)
  const marks = state.doc.nodeAt(range.from)?.marks
  editor.view.dispatch(
    text
      ? state.tr.replaceWith(range.from, range.to, state.schema.text(text, marks))
      : state.tr.delete(range.from, range.to),
  )
  refreshScene(current.sceneId)

  // On: later in the scene, else in the scenes after it, round the book.
  const later = docMatches(editor.state.doc, regex).findIndex((next) => next.from >= range.from + text.length)
  if (later !== -1) {
    const chapterId = chapterOfScene(page.plan, current.sceneId)?.id ?? page.chapterId
    return revealMatch(page, { sceneId: current.sceneId, chapterId, ordinal: later }, "show")
  }
  const order = sceneOrder(page.plan)
  const at = order.get(current.sceneId) ?? -1
  const { matches } = bookResults(page.plan, useFind.getState().texts, regex)
  const next = matches.find((candidate) => (order.get(candidate.sceneId) ?? -1) > at) ?? matches.at(0)
  if (next) revealMatch(page, next, "show")
  else useFind.setState({ current: null })
}

/** How long Replace all can be undone, at most: the toast's Undo, kept a while longer if it's hovered. */
const REPLACE_UNDO_MS = 60_000
/** A long search is cut short in a version's name. */
const LABEL_QUERY = 40

const matchesText = (count: number) => `${formatCount(count)} ${count === 1 ? "match" : "matches"}`
const scenesText = (count: number) => `${formatCount(count)} ${count === 1 ? "scene" : "scenes"}`

interface Replaced {
  sceneId: string
  provider: SceneDocProvider
  undo: Y.UndoManager | null
}

/**
 * Replaces every match in the book, once every scene has been read. Each scene it changes gets a version of its
 * text from before, and the toast's Undo puts them all back. Ctrl+Z in the text can't: it undoes the writer's typing.
 */
export async function replaceAll(page: FindPage) {
  const mine = session
  const regex = currentRegex()
  const { query, replacement, pattern, texts, busy } = useFind.getState()
  if (!mine || !regex || busy || bookResults(page.plan, texts, regex).partial) return
  useFind.setState({ busy: true, current: null })
  cancelReveal()
  for (const { editor } of useEditors.getState().mounted) showFind(editor, { current: null })

  const origin = Symbol("replace all")
  const held: Replaced[] = []
  let count = 0
  let scenes = 0
  let released = false
  let fallback = 0
  const release = () => {
    if (released) return
    released = true
    window.clearTimeout(fallback)
    for (const { sceneId, undo } of held) {
      undo?.destroy()
      releaseSceneDoc(sceneId)
    }
  }

  try {
    // Open scenes may have edits the texts haven't caught up with.
    const affected: string[] = []
    for (const chapter of page.plan.chapters) {
      for (const { id } of chapter.scenes) {
        const live = openSceneDoc(id)
        if (live) await live.loaded
        const runs = live ? runTexts(live.doc) : (texts.get(id) ?? [])
        if (runs.some((text) => matchesIn(text, regex, 1).length > 0)) affected.push(id)
      }
    }
    const label = `Before replacing “${query.length > LABEL_QUERY ? `${query.slice(0, LABEL_QUERY - 1)}…` : query}”`
    for (const sceneId of affected) {
      const item: Replaced = { sceneId, provider: acquireSceneDoc(sceneId), undo: null }
      held.push(item)
      await item.provider.loaded
      await saveVersion(mine.db, sceneId, item.provider.doc, { kind: "auto", label })
      const fragment = item.provider.doc.getXmlFragment(PROSE_FIELD)
      item.undo = new Y.UndoManager(fragment, { trackedOrigins: new Set([origin]), captureTimeout: 0 })
      const replaced = replaceAllInDoc(item.provider.doc, regex, replacement, pattern, origin)
      count += replaced
      if (replaced) scenes++
      refreshScene(sceneId)
    }
    await Promise.all(held.map(({ provider }) => provider.flush()))
  } catch (error) {
    for (const { undo } of [...held].reverse()) undo?.undo()
    release()
    reportError("replace all", error)
    return
  } finally {
    useFind.setState({ busy: false })
  }

  if (count === 0) {
    release()
    toast("Nothing was replaced, as there were no matches.")
    return
  }

  const undoAll = async () => {
    if (released) return
    try {
      for (const { undo } of [...held].reverse()) undo?.undo()
      await Promise.all(held.map(({ provider }) => provider.flush()))
      for (const { sceneId } of held) refreshScene(sceneId)
      announce("Undone")
    } catch (error) {
      reportError("undo replace all", error)
    } finally {
      release()
    }
  }
  const toastId = toast(`Replaced ${matchesText(count)} in ${scenesText(scenes)}`, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        // As offerUndo does: let focus go back from the toast now, not later.
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest("[data-sonner-toaster]")) active.blur()
        void undoAll()
      },
    },
    onAutoClose: release,
    onDismiss: release,
  })
  fallback = window.setTimeout(() => {
    toast.dismiss(toastId)
    release()
  }, REPLACE_UNDO_MS)
}

/**
 * Closing the panel from inside it, having gone to a match from there: the match's editor, with the match selected,
 * for focus to go to. Else null, and focus goes back where the panel was opened from.
 */
export function matchToReturnTo(): Editor | null {
  if (!returnToMatch || !document.activeElement?.closest(FIND_PANEL)) return null
  const { current } = useFind.getState()
  const entry = current ? editorOf(current.sceneId) : undefined
  const range = entry ? currentFind(entry.editor.state) : null
  if (!entry || !range) return null
  entry.editor.commands.setTextSelection(range)
  return entry.editor
}

/**
 * Opens the panel at Find and replace, focus in its search, which words selected in the text start. Opened from the
 * text, focus goes back there as the panel closes.
 */
export function openFind({ setPanel, setPanelOpener }: Pick<WriteContextValue, "setPanel" | "setPanelOpener">) {
  const entry = useEditors.getState().focused
  const fromText = entry && !entry.editor.isDestroyed && entry.editor.view.hasFocus() ? entry.editor : null
  if (fromText) {
    const { from, to, empty } = fromText.state.selection
    const selected = empty ? "" : fromText.state.doc.textBetween(from, to, "\n", "\n")
    const seed = seedQuery(selected, useFind.getState().pattern)
    if (seed !== null) setFindQuery(seed)
  }
  setPanel("find")
  if (fromText) setPanelOpener(fromText)
  focusSoon(FIND_INPUT)
}
