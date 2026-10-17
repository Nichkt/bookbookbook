import { generateKeyBetween } from "fractional-indexing"
import { ChangeSet } from "@/db/changes"
import { insertBuiltinCodexTypes } from "@/db/codexTypes"
import { insertRow, updateRow, type Db } from "@/db/tx"
import { newChapterRow } from "@/features/plan/mutations"
import { newId } from "@/lib/id"

export const DEFAULT_BOOK_TARGET = 80_000

/**
 * A new book gets its own universe, the built-in codex types, and one blank chapter to start from. No acts: they
 * appear when the writer adds the first one.
 */
export async function createBook(
  db: Db,
  input: { title: string; targetWords: number | null },
): Promise<{ bookId: string; chapterId: string }> {
  return db.writeTransaction(async (tx) => {
    const title = input.title.trim() || "Untitled book"
    const universeId = newId()
    const bookId = newId()
    const chapterId = newId()
    await insertRow(tx, "universes", { id: universeId, name: title })
    await insertRow(tx, "books", {
      id: bookId,
      universe_id: universeId,
      title,
      genre: "",
      target_words: input.targetWords,
      style_guide: "",
      sample_passages: "[]",
      created_at: new Date().toISOString(),
    })
    await insertBuiltinCodexTypes(tx, universeId)
    await insertRow(
      tx,
      "chapters",
      newChapterRow({ id: chapterId, book_id: bookId, position: generateKeyBetween(null, null) }),
    )
    return { bookId, chapterId }
  })
}

export interface BookPatch {
  title?: string
  author?: string
  genre?: string
  target_words?: number | null
}

export async function updateBook(db: Db, id: string, patch: BookPatch) {
  const values: Record<string, string | number | null> = {}
  if (patch.title !== undefined) values.title = patch.title
  if (patch.author !== undefined) values.author = patch.author
  if (patch.genre !== undefined) values.genre = patch.genre
  if (patch.target_words !== undefined) values.target_words = patch.target_words
  await updateRow(db, "books", id, values)
}

export async function trashBook(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "books", [id])
    await updateRow(tx, "books", id, { deleted_at: new Date().toISOString() })
    return changes
  })
}

export async function restoreBook(db: Db, id: string) {
  await updateRow(db, "books", id, { deleted_at: null })
}
