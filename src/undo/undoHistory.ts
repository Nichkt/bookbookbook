import type { Editor } from "@tiptap/react"
import { toast, type ExternalToast } from "sonner"
import type { UndoManager } from "yjs"
import { create } from "zustand"
import { announce } from "@/app/announce"
import { flushDrafts } from "@/app/saveStatus"
import type { Db } from "@/db/tx"
import { useEditors } from "@/editor/activeEditor"
import { nameScene } from "./describe"
import { watchWrites, type Recording, type RecorderHooks, type RecordingContext, type WriteWatcher } from "./recorder"
import { compose, makeStep, revertStep, type Step, type StepChange } from "./steps"

/*
 * Undo and Redo (DESIGN.md §12): one history per book of the writer's edits, whichever screen they were made on.
 * Edits to the plan, the World, the Inbox and the book's settings are recorded from the database (recorder.ts).
 * Typing in a scene's text stays with its editor's own undo, from Yjs, and Undo takes back whichever came last. The
 * history lasts while the app is open.
 */

/** Edits kept per book. */
const LIMIT = 100
/** A field's typing saves in pieces as the writer pauses; pieces this close together undo as one. */
const MERGE_MS = 4000
/** Columns that place a row rather than say something in it: changing them is never typing. */
const PLACING = new Set(["position", "act_id", "chapter_id", "parent_kind", "parent_id", "deleted_at"])
const TOAST_MS = 8000

interface Redoable {
  step: Step
  /** What undoing it did, which redoing takes back. */
  inverse: readonly StepChange[]
}

interface History {
  undo: Step[]
  redo: Redoable[]
}

const histories = new Map<string, History>()
let context: RecordingContext | null = null
let watcher: WriteWatcher | null = null
let database: Db | null = null

/** What Undo and Redo would do: "Changed the status of chapter 3", or null when there's nothing. For their buttons. */
export const useUndoLabels = create<{ undo: string | null; redo: string | null }>(() => ({ undo: null, redo: null }))

const changed = () => useUndoLabels.setState({ undo: nextUndo(), redo: nextRedo() })

/**
 * Counts the times Undo or Redo, or a toast's Undo, has put rows back: a field showing its own text then shows the
 * stored text again, even while it has focus (useDraft).
 */
export const useTakenBack = create<{ count: number }>(() => ({ count: 0 }))

export const tookBack = () => useTakenBack.setState((state) => ({ count: state.count + 1 }))

function historyOf(bookId: string): History {
  let history = histories.get(bookId)
  if (!history) histories.set(bookId, (history = { undo: [], redo: [] }))
  return history
}

/** Starts recording the open book's edits, reporting every write to `hooks`. Returns a function that stops it. */
export function installUndo(db: Db, hooks: Pick<RecorderHooks, "writeStarted" | "writeEnded"> = {}): () => void {
  database = db
  watcher = watchWrites(db, { ...hooks, context: () => context, finish: makeStep, recorded: keep })
  const stopFollowing = followEditors()
  return () => {
    stopFollowing()
    watcher?.stop()
    watcher = null
    database = null
    context = null
    histories.clear()
    typing.clear()
    changed()
  }
}

/** The book open, whose edits are recorded and undone; null on the home screen. */
export function setUndoContext(next: RecordingContext | null) {
  if (next?.bookId === context?.bookId && next?.universeId === context?.universeId) return
  context = next && { bookId: next.bookId, universeId: next.universeId }
  // Its button would now undo or redo in another book.
  dropToast()
  changed()
}

// ── Keeping edits ───────────────────────────────────────────────────────────

/** A new edit, recorded and written: it goes on the history, and what was undone before it can't be redone. */
function keep(recording: Recording) {
  const step = recording.step
  if (!step) return
  dropToast()
  const history = historyOf(step.bookId)
  const top = history.undo[history.undo.length - 1]
  if (recording.retract && retract(history, step)) {
    recording.step = undefined
  } else if (top && joins(top, step)) {
    top.changes = compose(top.changes, step.changes)
    top.at = step.at
    if (top.changes.length > 0) recording.step = top
    else {
      history.undo.pop()
      recording.step = undefined
    }
  } else {
    history.undo.push(step)
    if (history.undo.length > LIMIT) history.undo.shift()
  }
  history.redo = []
  for (const undoManager of typing.keys()) {
    if (undoManager.redoStack.length > 0) undoManager.clear(false, true)
  }
  changed()
}

/** Whether `step` continues typing in the same field as `top`, to undo with it as one. */
function joins(top: Step, step: Step): boolean {
  if (top.sealed || step.at - top.at > MERGE_MS || top.changes.length !== 1 || step.changes.length !== 1) return false
  const [a] = top.changes
  const [b] = step.changes
  return (
    Boolean(a.before && a.after && b.before && b.after) &&
    a.table === b.table &&
    a.id === b.id &&
    a.columns.length === b.columns.length &&
    a.columns.every((column) => b.columns.includes(column) && !PLACING.has(column))
  )
}

const keyOf = (change: StepChange) => `${change.table} ${change.id}`

/**
 * Takes out of the history the edits `step` takes back, as leaving out a chapter just added takes back adding it,
 * if together they come to nothing. Edits to other rows in between stay.
 */
function retract(history: History, step: Step): boolean {
  let rest: readonly StepChange[] = step.changes
  const cancelled = new Set<Step>()
  for (let index = history.undo.length - 1; index >= 0 && rest.length > 0; index--) {
    const earlier = history.undo[index]
    const rows = new Set(rest.map(keyOf))
    const shared = earlier.changes.filter((change) => rows.has(keyOf(change))).length
    if (shared === 0) continue
    // It also changed something else, which would go with it.
    if (shared < earlier.changes.length) return false
    rest = compose(earlier.changes, rest)
    cancelled.add(earlier)
  }
  if (rest.length > 0) return false
  history.undo = history.undo.filter((earlier) => !cancelled.has(earlier))
  return true
}

// ── Typing in scenes ────────────────────────────────────────────────────────

/** When the stack item was done, or last redone. */
const DONE_AT = Symbol("doneAt")
/** When the stack item was undone. */
const UNDONE_AT = Symbol("undoneAt")

interface Typing {
  editor: Editor
  sceneId: string
  /** "Typing in “Ferry wake”" */
  label: string
}

interface StackItemEvent {
  stackItem: { meta: Map<unknown, unknown> }
  type: "undo" | "redo"
}

/** The undo managers of the scene editors on the page, with what Undo calls their typing. */
const typing = new Map<UndoManager, Typing>()
/** Undo managers this listens to. A manager keeps its listeners when its editor remounts (StrictMode). */
const listening = new WeakSet<UndoManager>()

function followEditors(): () => void {
  const follow = () => {
    const mounted = new Set<UndoManager>()
    for (const { editor, sceneId, undoManager } of useEditors.getState().mounted) {
      if (!undoManager || editor.isDestroyed) continue
      mounted.add(undoManager)
      if (!typing.has(undoManager)) listen(undoManager, editor, sceneId)
    }
    for (const undoManager of [...typing.keys()]) if (!mounted.has(undoManager)) typing.delete(undoManager)
    changed()
  }
  follow()
  return useEditors.subscribe((state, previous) => {
    if (state.mounted !== previous.mounted) follow()
  })
}

function listen(undoManager: UndoManager, editor: Editor, sceneId: string) {
  const entry: Typing = { editor, sceneId, label: "Typing" }
  typing.set(undoManager, entry)
  void nameTyping(entry)
  if (listening.has(undoManager)) return
  listening.add(undoManager)
  undoManager.on("stack-item-added", (event: StackItemEvent, from: UndoManager) => {
    if (event.type === "redo") event.stackItem.meta.set(UNDONE_AT, Date.now())
    else {
      event.stackItem.meta.set(DONE_AT, Date.now())
      if (!from.redoing) typed(from)
      const named = typing.get(from)
      if (named && !from.redoing) void nameTyping(named)
    }
    changed()
  })
  undoManager.on("stack-item-updated", (event: StackItemEvent, from: UndoManager) => {
    if (event.type !== "undo") return
    event.stackItem.meta.set(DONE_AT, Date.now())
    if (!from.redoing && typed(from)) changed()
  })
  undoManager.on("stack-item-popped", () => changed())
  undoManager.on("stack-cleared", () => changed())
}

/**
 * New typing in a scene is a new edit like any other: nothing undone before it can be redone, and the field edit
 * before it no longer takes in more. Returns whether that dropped anything to redo.
 */
function typed(undoManager: UndoManager): boolean {
  if (!typing.has(undoManager)) return false
  dropToast()
  let dropped = false
  const history = context && histories.get(context.bookId)
  if (history) {
    if (history.redo.length > 0) {
      history.redo = []
      dropped = true
    }
    const top = history.undo[history.undo.length - 1]
    if (top) top.sealed = true
  }
  for (const other of typing.keys()) {
    if (other !== undoManager && other.redoStack.length > 0) {
      other.clear(false, true)
      dropped = true
    }
  }
  return dropped
}

async function nameTyping(entry: Typing) {
  if (!database) return
  try {
    const row = await database.getOptional<{ book_id: string | null }>(
      "SELECT chapters.book_id FROM scenes JOIN chapters ON chapters.id = scenes.chapter_id WHERE scenes.id = ?",
      [entry.sceneId],
    )
    const label = row?.book_id ? `Typing in ${await nameScene(database, row.book_id, entry.sceneId)}` : "Typing"
    if (label !== entry.label) {
      entry.label = label
      changed()
    }
  } catch (error) {
    console.error("[undo] couldn't name a scene", error)
  }
}

const timeOf = (item: { meta: Map<unknown, unknown> } | undefined, key: symbol) => {
  const at = item?.meta.get(key)
  return typeof at === "number" ? at : 0
}

// ── Undo and Redo ───────────────────────────────────────────────────────────

type Candidate<T> =
  | { kind: "rows"; at: number; item: T }
  | { kind: "typing"; at: number; undoManager: UndoManager; entry: Typing }

/** Picks the latest of `rows` and each scene's typing, by the time `key` gives a stack item. */
function latest<T>(
  rows: { at: number; item: T } | null,
  stack: (undoManager: UndoManager) => readonly { meta: Map<unknown, unknown> }[],
  key: symbol,
): Candidate<T> | null {
  let best: Candidate<T> | null = rows && { kind: "rows", ...rows }
  for (const [undoManager, entry] of typing) {
    const items = stack(undoManager)
    if (entry.editor.isDestroyed || items.length === 0) continue
    const at = timeOf(items[items.length - 1], key)
    if (!best || at > best.at) best = { kind: "typing", at, undoManager, entry }
  }
  return best
}

const currentHistory = () => (context ? histories.get(context.bookId) : undefined)

function nextUndoCandidate(): Candidate<Step> | null {
  const history = currentHistory()
  const top = history?.undo[history.undo.length - 1]
  return latest(top ? { at: top.at, item: top } : null, (undoManager) => undoManager.undoStack, DONE_AT)
}

function nextRedoCandidate(): Candidate<Redoable> | null {
  const history = currentHistory()
  const top = history?.redo[history.redo.length - 1]
  return latest(top ? { at: top.step.undoneAt, item: top } : null, (undoManager) => undoManager.redoStack, UNDONE_AT)
}

const labelOf = (candidate: Candidate<Step> | Candidate<Redoable> | null): string | null => {
  if (!candidate) return null
  if (candidate.kind === "typing") return candidate.entry.label
  return "step" in candidate.item ? candidate.item.step.label : candidate.item.label
}

/** What Undo would take back: "Changed the status of chapter 3". Null when there's nothing. */
export const nextUndo = (): string | null => labelOf(nextUndoCandidate())

/** What Redo would do again. Null when there's nothing. */
export const nextRedo = (): string | null => labelOf(nextRedoCandidate())

let queue: Promise<unknown> = Promise.resolve()

/** Runs Undo and Redo one at a time, each once any typing waiting in a field is written, so it can be undone. */
function serially<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    await flushDrafts()
    return work()
  })
  queue = run.catch(() => undefined)
  return run
}

/** Takes back the book's latest edit. Resolves to whether anything was undone. */
export const undo = (): Promise<boolean> => serially(() => guarded("undo", undoLatest))

/** Does again what Undo last took back. Resolves to whether anything was redone. */
export const redo = (): Promise<boolean> => serially(() => guarded("redo", redoLatest))

async function guarded(what: "undo" | "redo", work: () => Promise<boolean>): Promise<boolean> {
  try {
    return await work()
  } catch (error) {
    console.error(`[${what}]`, error)
    toast.error(`Something went wrong, so that couldn't be ${what === "undo" ? "undone" : "redone"}.`)
    changed()
    return false
  }
}

async function undoLatest(): Promise<boolean> {
  for (;;) {
    const candidate = nextUndoCandidate()
    if (!candidate) {
      announce("Nothing to undo")
      return false
    }
    if (candidate.kind === "typing") {
      if (stepTyping(candidate, "undo")) return true
      continue
    }
    const outcome = await undoRows(historyOf(candidate.item.bookId), candidate.item, false)
    if (outcome !== "nothing") return outcome === "undone"
  }
}

async function redoLatest(): Promise<boolean> {
  for (;;) {
    const candidate = nextRedoCandidate()
    if (!candidate) {
      announce("Nothing to redo")
      return false
    }
    if (candidate.kind === "typing") {
      if (stepTyping(candidate, "redo")) return true
      continue
    }
    const outcome = await redoRows(historyOf(candidate.item.step.bookId), candidate.item)
    if (outcome !== "nothing") return outcome === "redone"
  }
}

/** Undoes or redoes a scene's typing through its editor. False if that had no effect, which empties the stack. */
function stepTyping({ undoManager, entry }: { undoManager: UndoManager; entry: Typing }, what: "undo" | "redo") {
  const { editor } = entry
  const target = what === "undo" ? undoManager.redoStack : undoManager.undoStack
  const before = target.length
  if (what === "undo") editor.commands.undo()
  else editor.commands.redo()
  if (target.length <= before) return false
  editor.commands.scrollIntoView()
  // An edit's toast still up would offer to undo or redo this typing, under the edit's name.
  dropToast()
  announce(`${what === "undo" ? "Undone" : "Redone"}: ${entry.label}`)
  return true
}

// ── Toasts ──────────────────────────────────────────────────────────────────

/** The id of the toast from Undo or Redo that's up, which the next replaces in place rather than piling up. */
let toastUp: string | null = null
/** Toasts Undo and Redo have put up: to give each new one an id, and to tell whether a toast's button put one up. */
let toastsShown = 0

/** Puts up a toast from Undo or Redo, in place of the one up. */
function showToast(message: string, options: Pick<ExternalToast, "description" | "action"> = {}) {
  toastsShown++
  const id = toastUp ?? `undo-${toastsShown}`
  toastUp = id
  // As it goes, Sonner takes away whatever has its id, so the next toast gets an id of its own.
  const gone = () => {
    if (toastUp === id) toastUp = null
  }
  // Sonner keeps what's left out from the toast this replaces, so it's said there's none.
  toast(message, {
    description: undefined,
    action: undefined,
    ...options,
    id,
    duration: TOAST_MS,
    onAutoClose: gone,
    onDismiss: gone,
  })
}

/** Takes down the toast from Undo or Redo, as when its button would no longer do what it says. */
function dropToast() {
  if (toastUp === null) return
  toast.dismiss(toastUp)
  toastUp = null
}

/** A toast's Redo or Undo button. The toast stays up to say how that went, or goes if there's nothing to say. */
const fromToast = (what: () => Promise<boolean>) => (event: { preventDefault(): void }) => {
  // Sonner would otherwise take the toast away, and with it the one put up in its place.
  event.preventDefault()
  const shown = toastsShown
  void what().then(() => {
    if (toastsShown === shown) dropToast()
  })
}

const contextOf = (step: Step): RecordingContext => ({ bookId: step.bookId, universeId: step.universeId })

const PARTLY = "Some of it had changed since, so that part stayed as it is."

/**
 * Undoes one step, wherever it is in the history: what's changed since stays. `quiet` leaves the telling to the
 * toast that offered it. "nothing" means it had nothing left to undo.
 */
async function undoRows(history: History, step: Step, quiet: boolean): Promise<UndoOutcome> {
  if (!watcher) return "nothing"
  const { result, recording } = await watcher.record(contextOf(step), (tx) => revertStep(tx, step))
  history.undo = history.undo.filter((kept) => kept !== step)
  if (step.toastId !== undefined) toast.dismiss(step.toastId)
  const inverse = recording.step
  if (!inverse) {
    changed()
    if (result.conflicts === 0) return "nothing"
    showToast("Couldn't undo that, as it has changed since.", { description: step.label })
    return "stuck"
  }
  tookBack()
  step.undoneAt = Date.now()
  history.redo.push({ step, inverse: inverse.changes })
  changed()
  if (!quiet) {
    showToast(`Undone: ${step.label}`, {
      description: result.conflicts > 0 ? PARTLY : undefined,
      action: { label: "Redo", onClick: fromToast(redo) },
    })
  } else if (result.conflicts > 0) {
    showToast(PARTLY)
  }
  return "undone"
}

async function redoRows(history: History, entry: Redoable): Promise<"redone" | "stuck" | "nothing"> {
  if (!watcher) return "nothing"
  const { step } = entry
  const { result, recording } = await watcher.record(contextOf(step), (tx) =>
    revertStep(tx, { changes: entry.inverse }),
  )
  history.redo = history.redo.filter((kept) => kept !== entry)
  const again = recording.step
  if (!again) {
    changed()
    if (result.conflicts === 0) return "nothing"
    showToast("Couldn't redo that, as it has changed since.", { description: step.label })
    return "stuck"
  }
  tookBack()
  step.changes = again.changes
  step.at = Date.now()
  step.undoneAt = 0
  step.sealed = true
  history.undo.push(step)
  if (history.undo.length > LIMIT) history.undo.shift()
  changed()
  showToast(`Redone: ${step.label}`, {
    description: result.conflicts > 0 ? PARTLY : undefined,
    action: { label: "Undo", onClick: fromToast(undo) },
  })
  return "redone"
}

/** How undoing a step from its toast went. */
export type UndoOutcome = "undone" | "nothing" | "stuck" | "already"

/**
 * Undoes one step from the toast that offered it, even with edits after it, which stay. "already" when Undo got to
 * it first.
 */
export function undoStep(step: Step): Promise<UndoOutcome> {
  return serially(async () => {
    const history = historyOf(step.bookId)
    if (step.undoneAt > 0 && !history.undo.includes(step)) return "already"
    return undoRows(history, step, true)
  })
}

/** Takes a step out of the history, as when its toast has undone it another way. */
export function forgetStep(step: Step) {
  const history = histories.get(step.bookId)
  if (!history?.undo.includes(step)) return
  history.undo = history.undo.filter((kept) => kept !== step)
  changed()
}
