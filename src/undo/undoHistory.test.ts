import type { Editor } from "@tiptap/react"
import { toast } from "sonner"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import * as Y from "yjs"
import { useAnnouncer } from "@/app/announce"
import { offerUndo } from "@/app/feedback"
import { draftSaved, draftWaiting } from "@/app/saveStatus"
import { useEditors } from "@/editor/activeEditor"
import { updateBook } from "@/features/books/mutations"
import { createCodexEntry } from "@/features/codex/mutations"
import { addNote } from "@/features/inbox/mutations"
import {
  addBeat,
  createAct,
  createChapter,
  discardNewChapter,
  setChapterLinks,
  trashChapter,
  updateBeat,
  updateChapter,
} from "@/features/plan/mutations"
import { buildBook, chapterRow } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  installUndo,
  nextRedo,
  nextUndo,
  redo,
  setUndoContext,
  undo,
  undoStep,
  useTakenBack,
  useUndoLabels,
} from "./undoHistory"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(() => "toast"), { error: vi.fn(), dismiss: vi.fn() }) }))

const BOOK = { bookId: "book", universeId: "universe" }
const PARTLY = "Some of it had changed since, so that part stayed as it is."

let db: ReturnType<typeof createTestDb>
let stop: () => void

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2025-03-01T09:00:00Z"))
  db = createTestDb()
  await buildBook(db, {
    acts: [{ title: "One", chapters: [{ title: "A", beats: ["x"], scenes: [{ title: "Dock" }] }, { title: "B" }] }],
  })
  stop = installUndo(db)
  setUndoContext(BOOK)
  vi.mocked(toast).mockClear()
  vi.mocked(toast.dismiss).mockClear()
})
afterEach(() => {
  stop()
  useEditors.setState({ mounted: [], focused: null })
  db.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Moves the clock past a pause in typing. */
const later = () => vi.setSystemTime(Date.now() + 5000)

const status = async (id: string) => (await chapterRow(db, id)).status

/** As from another tab or a sync: an edit the history doesn't see. */
async function elsewhere(edit: () => Promise<unknown>) {
  setUndoContext(null)
  await edit()
  setUndoContext(BOOK)
}

test("Undo takes back the book's latest edit, and Redo does it again", async () => {
  await updateChapter(db, "ch-A", { status: "drafted" })
  expect(useUndoLabels.getState()).toEqual({ undo: "Changed the status of “A”", redo: null })

  const takenBack = useTakenBack.getState().count
  expect(await undo()).toBe(true)
  expect(await status("ch-A")).toBe("idea")
  expect(useUndoLabels.getState()).toEqual({ undo: null, redo: "Changed the status of “A”" })
  expect(useTakenBack.getState().count).toBe(takenBack + 1)
  expect(toast).toHaveBeenLastCalledWith(
    "Undone: Changed the status of “A”",
    expect.objectContaining({ id: expect.stringMatching(/^undo-/), action: expect.objectContaining({ label: "Redo" }) }),
  )
  const { id } = lastToast()

  expect(await redo()).toBe(true)
  expect(await status("ch-A")).toBe("drafted")
  expect(useUndoLabels.getState()).toEqual({ undo: "Changed the status of “A”", redo: null })
  // In place of the toast before, rather than piling up.
  expect(toast).toHaveBeenLastCalledWith(
    "Redone: Changed the status of “A”",
    expect.objectContaining({ id, action: expect.objectContaining({ label: "Undo" }) }),
  )

  expect(await undo()).toBe(true)
  expect(await status("ch-A")).toBe("idea")
})

test("says when there's nothing to undo or redo", async () => {
  expect(await undo()).toBe(false)
  expect(useAnnouncer.getState().message).toBe("Nothing to undo")
  expect(await redo()).toBe(false)
  expect(useAnnouncer.getState().message).toBe("Nothing to redo")
})

test("names each edit as the screens do", async () => {
  const named = async (edit: () => Promise<unknown>) => {
    later()
    await edit()
    return nextUndo()
  }
  expect(await named(() => updateChapter(db, "ch-A", { title: "Arrival" }))).toBe("Renamed “A”")
  expect(await named(() => updateChapter(db, "ch-B", { summary: "Gulls" }))).toBe("Changed the summary of “B”")
  expect(await named(() => createChapter(db, "book", { actId: "act-One" }))).toBe("Added chapter 3")
  expect(await named(() => trashChapter(db, "ch-B"))).toBe("Moved “B” to the Trash")
  expect(await named(() => createAct(db, "book", { title: "Two" }))).toBe("Added “Two”")
  expect(await named(() => addBeat(db, "ch-A"))).toBe("Added a moment to “Arrival”")
  expect(await named(() => updateBeat(db, "beat-A-1", { done: true }))).toBe("Marked a moment done in “Arrival”")
  expect(await named(() => updateBook(db, "book", { title: "Gulls" }))).toBe("Renamed the book")
  expect(await named(() => updateBook(db, "book", { genre: "Noir" }))).toBe("Changed the book's genre")
  const color = "#336699"
  let mara = ""
  const added = await named(async () => {
    mara = await createCodexEntry(db, { bookId: "book", typeKey: "characters", name: "Mara", color })
  })
  expect(added).toBe("Added “Mara” to the World")
  expect(await named(() => setChapterLinks(db, "ch-A", "present", [mara]))).toBe(
    "Changed the characters present in “Arrival”",
  )
  expect(await named(() => addNote(db, { bookId: "book", text: "Gulls" }))).toBe("Added a note")
})

test("typing in a field undoes as one edit, until a pause or another field", async () => {
  for (const summary of ["G", "Gu", "Gulls"]) await updateChapter(db, "ch-A", { summary })
  later()
  await updateChapter(db, "ch-A", { summary: "Gulls cry" })
  await updateChapter(db, "ch-A", { notes: "Check the tides" })
  expect(await undo()).toBe(true)
  expect(await chapterRow(db, "ch-A")).toMatchObject({ summary: "Gulls cry", notes: "" })
  expect(await undo()).toBe(true)
  expect((await chapterRow(db, "ch-A")).summary).toBe("Gulls")
  expect(await undo()).toBe(true)
  expect((await chapterRow(db, "ch-A")).summary).toBe("")
  expect(nextUndo()).toBeNull()
})

test("typing that ends where it began leaves nothing to undo", async () => {
  await updateChapter(db, "ch-A", { summary: "G" })
  await updateChapter(db, "ch-A", { summary: "" })
  expect(nextUndo()).toBeNull()
})

test("a new edit after Undo leaves nothing to redo", async () => {
  await updateChapter(db, "ch-A", { status: "drafted" })
  await undo()
  await updateChapter(db, "ch-B", { status: "drafted" })
  expect(nextRedo()).toBeNull()
  expect(await redo()).toBe(false)
})

test("Undo first saves typing waiting in a field, so it can take that back", async () => {
  draftWaiting("field", async () => {
    await updateChapter(db, "ch-A", { summary: "Gulls" })
    draftSaved("field")
  })
  expect(await undo()).toBe(true)
  expect((await chapterRow(db, "ch-A")).summary).toBe("")
  expect(nextRedo()).toBe("Changed the summary of “A”")
})

test("keeps each book's history to itself, and leaves out edits made away from a book", async () => {
  await buildBook(db, { chapters: [{ title: "Z" }] }, "other")
  await updateChapter(db, "ch-A", { status: "drafted" })
  setUndoContext({ bookId: "other", universeId: "universe" })
  expect(nextUndo()).toBeNull()
  await updateChapter(db, "ch-Z", { status: "drafted" })
  expect(await undo()).toBe(true)
  expect(await status("ch-Z")).toBe("idea")
  expect(await status("ch-A")).toBe("drafted")

  setUndoContext(null)
  expect(nextUndo()).toBeNull()
  await updateChapter(db, "ch-A", { title: "From home" })
  setUndoContext(BOOK)
  expect(nextUndo()).toBe("Changed the status of “A”")
})

test("Undo leaves what's changed since, and says so", async () => {
  await updateChapter(db, "ch-A", { title: "Arrival", summary: "Gulls" })
  await elsewhere(() => updateChapter(db, "ch-A", { title: "Elsewhere" }))
  expect(await undo()).toBe(true)
  expect(await chapterRow(db, "ch-A")).toMatchObject({ title: "Elsewhere", summary: "" })
  expect(toast).toHaveBeenLastCalledWith("Undone: Edited “Arrival”", expect.objectContaining({ description: PARTLY }))
})

test("Undo can't take back an edit that has all changed since, and says so", async () => {
  await updateChapter(db, "ch-A", { status: "drafted" })
  await elsewhere(() => updateChapter(db, "ch-A", { status: "revised" }))
  expect(await undo()).toBe(false)
  expect(await status("ch-A")).toBe("revised")
  expect(toast).toHaveBeenLastCalledWith(
    "Couldn't undo that, as it has changed since.",
    expect.objectContaining({ description: "Changed the status of “A”" }),
  )
  expect(nextUndo()).toBeNull()
})

test("leaving out a chapter just added takes adding it out of the history", async () => {
  await updateChapter(db, "ch-A", { status: "drafted" })
  later()
  const id = await createChapter(db, "book", { actId: "act-One" })
  later()
  await updateChapter(db, "ch-B", { status: "drafted" })
  await updateChapter(db, id, { title: "Draft" })
  await updateChapter(db, id, { title: "" })
  expect(await discardNewChapter(db, id)).toEqual({ outcome: "deleted" })
  expect(nextUndo()).toBe("Changed the status of “B”")
  expect(await undo()).toBe(true)
  expect(nextUndo()).toBe("Changed the status of “A”")
})

// ── Toasts ──────────────────────────────────────────────────────────────────

interface ToastOptions {
  id?: string
  action?: { label: string; onClick: (event: { preventDefault(): void }) => void }
}

/** What the toast last put up was put up with. */
const lastToast = () => vi.mocked(toast).mock.lastCall?.[1] as unknown as ToastOptions

/** Clicks the Undo on the toast last shown. */
function clickToastUndo() {
  vi.stubGlobal("document", { activeElement: null })
  vi.stubGlobal("HTMLElement", class {})
  lastToast().action?.onClick({ preventDefault() {} })
}

test("Redo and Undo on Undo's toast put it up again in place, rather than Sonner taking it away", async () => {
  await updateChapter(db, "ch-A", { status: "drafted" })
  await undo()
  const undone = lastToast()
  const event = { preventDefault: vi.fn() }
  undone.action?.onClick(event)
  expect(event.preventDefault).toHaveBeenCalled()
  await vi.waitFor(() => expect(nextUndo()).toBe("Changed the status of “A”"))
  expect(await status("ch-A")).toBe("drafted")
  expect(toast).toHaveBeenLastCalledWith("Redone: Changed the status of “A”", expect.objectContaining({ id: undone.id }))

  lastToast().action?.onClick(event)
  await vi.waitFor(() => expect(nextRedo()).toBe("Changed the status of “A”"))
  expect(await status("ch-A")).toBe("idea")
  expect(toast).toHaveBeenLastCalledWith("Undone: Changed the status of “A”", expect.objectContaining({ id: undone.id }))
  expect(toast.dismiss).not.toHaveBeenCalled()
})

test("Undo's toast is taken down once its button would no longer do what it says", async () => {
  await updateChapter(db, "ch-A", { status: "drafted" })
  await undo()
  const first = lastToast()
  // A new edit: there's nothing to redo.
  await updateChapter(db, "ch-B", { status: "drafted" })
  expect(toast.dismiss).toHaveBeenLastCalledWith(first.id)

  // The next toast is a new one, as Sonner takes away whatever has the old one's id as it goes.
  await undo()
  const second = lastToast()
  expect(second.id).not.toBe(first.id)
  // Another book: its button would undo or redo there.
  setUndoContext(null)
  expect(toast.dismiss).toHaveBeenLastCalledWith(second.id)
  setUndoContext(BOOK)

  // A button that finds nothing to do takes its toast down.
  await redo()
  const third = lastToast()
  vi.mocked(toast.dismiss).mockClear()
  third.action?.onClick({ preventDefault() {} })
  await vi.waitFor(() => expect(nextRedo()).toBe("Changed the status of “B”"))
  expect(toast.dismiss).not.toHaveBeenCalled()
  // Its Undo again, with nothing left to undo.
  third.action?.onClick({ preventDefault() {} })
  await vi.waitFor(() => expect(toast.dismiss).toHaveBeenCalledWith(third.id))
  expect(useAnnouncer.getState().message).toBe("Nothing to undo")
})

test("a toast's Undo goes through the history, so Redo can bring the edit back", async () => {
  const onUndone = vi.fn()
  offerUndo(db, "Moved “B” to the Trash. It stays there for 30 days.", await trashChapter(db, "ch-B"), onUndone)
  expect(nextUndo()).toBe("Moved “B” to the Trash")
  later()
  await updateChapter(db, "ch-A", { status: "drafted" })
  const toasts = vi.mocked(toast).mock.calls.length

  clickToastUndo()
  await vi.waitFor(() => expect(onUndone).toHaveBeenCalled())
  expect((await chapterRow(db, "ch-B")).deleted_at).toBeNull()
  expect(await status("ch-A")).toBe("drafted")
  expect(useAnnouncer.getState().message).toBe("Undone")
  expect(vi.mocked(toast).mock.calls).toHaveLength(toasts)
  expect(nextUndo()).toBe("Changed the status of “A”")
  expect(nextRedo()).toBe("Moved “B” to the Trash")

  expect(await redo()).toBe(true)
  expect((await chapterRow(db, "ch-B")).deleted_at).not.toBeNull()
})

test("a toast's Undo for an edit the history didn't see puts the rows back itself", async () => {
  setUndoContext(null)
  const changes = await trashChapter(db, "ch-B")
  setUndoContext(BOOK)
  const onUndone = vi.fn()
  offerUndo(db, "Moved “B” to the Trash.", changes, onUndone)
  clickToastUndo()
  await vi.waitFor(() => expect(onUndone).toHaveBeenCalled())
  expect((await chapterRow(db, "ch-B")).deleted_at).toBeNull()
  expect(nextUndo()).toBeNull()
  expect(nextRedo()).toBeNull()
})

test("a toast's Undo after Undo got there first does nothing more", async () => {
  const changes = await trashChapter(db, "ch-B")
  const step = changes.recording?.step
  expect(step).toBeDefined()
  expect(await undo()).toBe(true)
  expect(await undoStep(step!)).toBe("already")
  expect(nextRedo()).toBe("Moved “B” to the Trash")
})

// ── Typing in scenes ────────────────────────────────────────────────────────

/** A scene's editor on the page, with the Yjs undo history its typing goes into. */
function mountScene(sceneId: string) {
  const doc = new Y.Doc()
  const text = doc.getText("prose")
  const undoManager = new Y.UndoManager(text, { captureTimeout: 0 })
  const editor = {
    isDestroyed: false,
    commands: {
      undo: () => undoManager.undo() !== null,
      redo: () => undoManager.redo() !== null,
      scrollIntoView: () => true,
    },
  } as unknown as Editor
  useEditors.setState((state) => ({ mounted: [...state.mounted, { editor, sceneId, undoManager }] }))
  return { text, type: (words: string) => text.insert(text.length, words) }
}

test("Undo takes back typing in a scene or an edit elsewhere, whichever came last", async () => {
  const scene = mountScene("sc-A-1")
  await updateChapter(db, "ch-A", { status: "drafted" })
  later()
  scene.type("Gulls")
  await vi.waitFor(() => expect(nextUndo()).toBe("Typing in “Dock”"))

  expect(await undo()).toBe(true)
  expect(scene.text.toString()).toBe("")
  expect(useAnnouncer.getState().message).toBe("Undone: Typing in “Dock”")
  expect(nextUndo()).toBe("Changed the status of “A”")
  later()
  expect(await undo()).toBe(true)
  expect(await status("ch-A")).toBe("idea")

  // Redo goes back the other way: the status, undone last, first.
  expect(nextRedo()).toBe("Changed the status of “A”")
  later()
  expect(await redo()).toBe(true)
  expect(nextRedo()).toBe("Typing in “Dock”")
  const { id } = lastToast()
  expect(await redo()).toBe(true)
  expect(scene.text.toString()).toBe("Gulls")
  // The status's toast would otherwise offer to undo the typing, under the status's name.
  expect(toast.dismiss).toHaveBeenLastCalledWith(id)
})

test("typing in a scene is a new edit: what was undone before can't be redone", async () => {
  const scene = mountScene("sc-A-1")
  await updateChapter(db, "ch-A", { status: "drafted" })
  await undo()
  later()
  scene.type("Gulls")
  expect(nextRedo()).toBeNull()

  later()
  await undo()
  expect(nextRedo()).toBe("Typing in “Dock”")
  later()
  await updateChapter(db, "ch-B", { status: "drafted" })
  expect(nextRedo()).toBeNull()
})
