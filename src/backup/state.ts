import { readPref, setPref } from "@/db/prefs"
import type { Db } from "@/db/tx"
import { backupFingerprint, readBackup, zipBackup, type BookBackup } from "@/export/backup"
import type { ExportFile } from "@/export/files"
import type { SceneReader } from "@/export/scenes"
import { afterBackup, afterCheck, parseRecord, recordKey, type BackupRecord, type WritingDay } from "./record"

/*
 * Keeping each book's backup record (record.ts) up to date as the book is checked, backed up or restored
 * (DESIGN.md §12). Each reads the writing days before the book: writing that lands between the two then dates a
 * later change sooner rather than later.
 */

/** The book's writing a day at a time, over every device. */
export function writingDays(db: Db, bookId: string): Promise<WritingDay[]> {
  return db.getAll<WritingDay>(
    `SELECT date, sum(coalesce(words_added, 0) + coalesce(words_removed, 0)) AS words
     FROM writing_stats WHERE book_id = ? AND date IS NOT NULL GROUP BY date`,
    [bookId],
  )
}

export async function readRecord(db: Db, bookId: string): Promise<BackupRecord | null> {
  return parseRecord(await readPref(db, recordKey(bookId)))
}

const saveRecord = (db: Db, bookId: string, record: BackupRecord) => setPref(db, recordKey(bookId), JSON.stringify(record))

/** A book as a check found it. */
export interface CheckedBook {
  backup: BookBackup
  hash: string
  days: WritingDay[]
  record: BackupRecord
}

/** Reads the book, and notes in its record whether it has changed since it was last backed up. */
export async function checkBook(db: Db, bookId: string, readScene: SceneReader, now = new Date()): Promise<CheckedBook> {
  const days = await writingDays(db, bookId)
  const backup = await readBackup(db, bookId, readScene, now)
  const hash = await backupFingerprint(backup)
  const record = await readRecord(db, bookId)
  const next = afterCheck(record, hash, days, now)
  if (next !== record) await saveRecord(db, bookId, next)
  return { backup, hash, days, record: next }
}

/** Notes that the book was just backed up as checked. */
export async function recordBackup(db: Db, bookId: string, checked: Pick<CheckedBook, "hash" | "days">, now = new Date()) {
  await saveRecord(db, bookId, afterBackup(checked.hash, checked.days, now))
}

/** The book as a backup zip, noted in its record as backed up. */
export async function takeBackup(db: Db, bookId: string, readScene: SceneReader, now = new Date()): Promise<ExportFile> {
  const days = await writingDays(db, bookId)
  const backup = await readBackup(db, bookId, readScene, now)
  const file = await zipBackup(db, backup, readScene)
  await recordBackup(db, bookId, { hash: await backupFingerprint(backup), days }, now)
  return file
}

/** Notes that a book just restored is as backed up as its backup: from when that was made, it holds nothing else. */
export async function recordRestored(
  db: Db,
  bookId: string,
  exportedAt: Date | null,
  readScene: SceneReader,
  now = new Date(),
) {
  const days = await writingDays(db, bookId)
  const hash = await backupFingerprint(await readBackup(db, bookId, readScene, now))
  await saveRecord(db, bookId, afterBackup(hash, days, now, exportedAt ?? now))
}
