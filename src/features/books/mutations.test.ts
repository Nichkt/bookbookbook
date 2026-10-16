import { afterEach, beforeEach, expect, test } from "vitest"
import { CODEX_TYPES } from "@/db/codexTypes"
import { createTestDb } from "@/test/sqliteDb"
import { createBook, restoreBook, trashBook, updateBook } from "./mutations"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

test("a new book has its own universe, the built-in codex types and one blank chapter", async () => {
  const { bookId, chapterId } = await createBook(db, { title: "  The Tide Clock ", targetWords: 90_000 })
  const book = await db.get<{ title: string; target_words: number; universe_id: string }>(
    "SELECT * FROM books WHERE id = ?",
    [bookId],
  )
  expect(book).toMatchObject({ title: "The Tide Clock", target_words: 90_000 })
  expect(await db.get("SELECT name FROM universes WHERE id = ?", [book.universe_id])).toEqual({
    name: "The Tide Clock",
  })
  const types = await db.getAll<{ key: string }>("SELECT key FROM codex_types WHERE universe_id = ?", [
    book.universe_id,
  ])
  expect(types.map((type) => type.key).sort()).toEqual(CODEX_TYPES.map((type) => type.key).sort())
  expect(await db.getAll("SELECT id, act_id, title, status FROM chapters")).toEqual([
    { id: chapterId, act_id: null, title: "", status: "idea" },
  ])
  expect(await db.getAll("SELECT id FROM acts")).toEqual([])
})

test("a blank title becomes Untitled book", async () => {
  const { bookId } = await createBook(db, { title: " ", targetWords: null })
  expect(await db.get("SELECT title, target_words FROM books WHERE id = ?", [bookId])).toEqual({
    title: "Untitled book",
    target_words: null,
  })
})

test("update, trash, undo and restore", async () => {
  const { bookId } = await createBook(db, { title: "Draft", targetWords: null })
  await updateBook(db, bookId, { title: "Final", genre: "Mystery", target_words: 70_000 })
  const row = () =>
    db.get<{ deleted_at: string | null }>("SELECT title, genre, target_words, deleted_at FROM books WHERE id = ?", [
      bookId,
    ])
  const before = await row()
  expect(before).toEqual({ title: "Final", genre: "Mystery", target_words: 70_000, deleted_at: null })

  const changes = await trashBook(db, bookId)
  expect((await row()).deleted_at).not.toBeNull()
  await db.writeTransaction((tx) => changes.revert(tx))
  expect(await row()).toEqual(before)

  await trashBook(db, bookId)
  await restoreBook(db, bookId)
  expect(await row()).toEqual(before)
})
