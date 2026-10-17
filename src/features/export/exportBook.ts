import { makeBackup } from "@/backup/actions"
import type { Db } from "@/db/tx"
import { flushSceneDocs } from "@/editor/sceneDocs"
import { manuscriptFile, type ExportFile } from "@/export/files"
import { loadManuscript } from "@/export/manuscript"
import { storedSceneReader } from "@/export/scenes"
import type { ExportChoices } from "./choices"

/** The file the choices make, with every edit made so far in it. Throws an ExportError to show the writer. */
export async function exportBook(db: Db, bookId: string, choices: ExportChoices): Promise<ExportFile> {
  // A backup made here counts as one, as much as one made from the Backups dialog (DESIGN.md §12).
  if (choices.format === "backup") return makeBackup(db, bookId)
  await flushSceneDocs()
  const readScene = storedSceneReader(db)
  return manuscriptFile(await loadManuscript(db, bookId, readScene), { ...choices, format: choices.format })
}
