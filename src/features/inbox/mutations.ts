import { ChangeSet } from "@/db/changes"
import type { ChapterRow } from "@/db/schema"
import { insertRow, updateRow, type Db, type Tx } from "@/db/tx"
import { appendBeatsIn } from "@/features/plan/mutations"
import { newId } from "@/lib/id"
import { plainToRichText, richTextToPlain } from "@/lib/richText"
import { appendText, momentsFrom, type FileAs, type FiledTo, type InboxNoteRow, type NoteSource } from "./inboxData"

/*
 * Inbox edits (DESIGN.md §10). Filing and deleting return the ChangeSet that undoes them, for an Undo toast: filing
 * puts the note back to sort and takes its text back out of where it went.
 */

const timestamp = () => new Date().toISOString()

export interface NewNote {
  bookId: string
  text: string
  source?: NoteSource
  /** For dictation, the engine that heard it (engine.ts `SttEngine`). */
  sttEngine?: string | null
}

/** Adds a note to sort. Its text is kept as written, less the blank space around it. */
export async function addNote(db: Db, { bookId, text, source = "typed", sttEngine = null }: NewNote): Promise<string> {
  const id = newId()
  await insertRow(db, "inbox_notes", {
    id,
    book_id: bookId,
    text: text.trim(),
    source,
    stt_engine: source === "typed" ? null : sttEngine,
    filed_to: null,
    created_at: timestamp(),
  })
  return id
}

export const updateNoteText = (db: Db, id: string, text: string) => updateRow(db, "inbox_notes", id, { text })

export async function deleteNote(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "inbox_notes", [id])
    await tx.execute("DELETE FROM inbox_notes WHERE id = ?", [id])
    return changes
  })
}

async function noteText(tx: Tx, id: string): Promise<string> {
  const note = await tx.getOptional<Pick<InboxNoteRow, "text">>("SELECT text FROM inbox_notes WHERE id = ?", [id])
  if (!note) throw new Error(`No inbox note ${id}`)
  return (note.text ?? "").trim()
}

async function setFiled(tx: Tx, id: string, filedTo: FiledTo | null, changes: ChangeSet) {
  await changes.captureIds(tx, "inbox_notes", [id])
  await updateRow(tx, "inbox_notes", id, { filed_to: filedTo && JSON.stringify(filedTo) })
}

/**
 * Files a note into a chapter: after its notes or summary, a blank line between, or as moments after its last, one
 * per line. Returns what Undo needs.
 */
export async function fileToChapter(db: Db, noteId: string, chapterId: string, as: FileAs): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    const text = await noteText(tx, noteId)
    const chapter = await tx.getOptional<Pick<ChapterRow, "notes" | "summary">>(
      "SELECT notes, summary FROM chapters WHERE id = ? AND deleted_at IS NULL",
      [chapterId],
    )
    if (!chapter) throw new Error(`No chapter ${chapterId} to file into`)
    if (as === "moments") {
      await appendBeatsIn(tx, chapterId, momentsFrom(text), changes)
    } else {
      await changes.captureIds(tx, "chapters", [chapterId])
      await updateRow(tx, "chapters", chapterId, { [as]: appendText(chapter[as], text) })
    }
    await setFiled(tx, noteId, { kind: "chapter", id: chapterId, as, at: timestamp() }, changes)
    return changes
  })
}

/** Files a note into a World entry, after its notes with a blank line between. Returns what Undo needs. */
export async function fileToEntry(db: Db, noteId: string, entryId: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    const text = await noteText(tx, noteId)
    const entry = await tx.getOptional<{ notes: string | null }>(
      "SELECT notes FROM codex_entries WHERE id = ? AND deleted_at IS NULL",
      [entryId],
    )
    if (!entry) throw new Error(`No World entry ${entryId} to file into`)
    await changes.captureIds(tx, "codex_entries", [entryId])
    await updateRow(tx, "codex_entries", entryId, {
      notes: plainToRichText(appendText(richTextToPlain(entry.notes), text)),
    })
    await setFiled(tx, noteId, { kind: "entry", id: entryId, as: "notes", at: timestamp() }, changes)
    return changes
  })
}

/** Notes that a note became a new World entry, which the Add to World dialog made. */
export async function markMadeIntoEntry(db: Db, noteId: string, entryId: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await setFiled(tx, noteId, { kind: "entry", id: entryId, as: "new", at: timestamp() }, changes)
    return changes
  })
}

/** Puts a filed note back to sort. What was filed stays where it went. */
export async function unfileNote(db: Db, noteId: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await setFiled(tx, noteId, null, changes)
    return changes
  })
}
