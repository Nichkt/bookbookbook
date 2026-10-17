import type { Db } from "@/db/tx"
import { flushSceneDocs, saveWordCounts } from "@/editor/sceneDocs"
import type { RestoredBook } from "@/export/backup"
import { downloadFile } from "@/export/download"
import type { ExportFile } from "@/export/files"
import { storedSceneReader } from "@/export/scenes"
import { withBackupLock } from "./scheduler"
import { recordRestored, takeBackup } from "./state"

/*
 * Backups the writer asks for (DESIGN.md §12), noted in the book's record like those written to the folder.
 */

/** The book's backup, with every edit made here so far in it, noted as made. */
export async function makeBackup(db: Db, bookId: string): Promise<ExportFile> {
  await flushSceneDocs()
  await saveWordCounts()
  return withBackupLock(() => takeBackup(db, bookId, storedSceneReader(db)))
}

/** Back up now: the book's backup, as a download. */
export async function downloadBackup(db: Db, bookId: string): Promise<ExportFile> {
  const file = await makeBackup(db, bookId)
  downloadFile(file)
  return file
}

/** Notes that a book just restored is backed up as of its backup. Should that fail, the book is none the worse. */
export async function noteRestored(db: Db, restored: RestoredBook) {
  try {
    await withBackupLock(() => recordRestored(db, restored.bookId, restored.exportedAt, storedSceneReader(db)))
  } catch (error) {
    console.error("[backups] Couldn't note the restored book's backup", error)
  }
}
