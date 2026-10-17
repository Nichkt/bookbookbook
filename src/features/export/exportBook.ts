import type { Db } from "@/db/tx"
import { flushSceneDocs } from "@/editor/sceneDocs"
import { backupFile } from "@/export/backup"
import { manuscriptFile, type ExportFile } from "@/export/files"
import { loadManuscript } from "@/export/manuscript"
import { storedSceneReader } from "@/export/scenes"
import type { ExportChoices } from "./choices"

/** The file the choices make, with every edit made so far in it. Throws an ExportError to show the writer. */
export async function exportBook(db: Db, bookId: string, choices: ExportChoices): Promise<ExportFile> {
  await flushSceneDocs()
  const readScene = storedSceneReader(db)
  if (choices.format === "backup") return backupFile(db, bookId, readScene)
  return manuscriptFile(await loadManuscript(db, bookId, readScene), { ...choices, format: choices.format })
}
