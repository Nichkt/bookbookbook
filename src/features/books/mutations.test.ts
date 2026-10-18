import { afterEach, beforeEach, expect, test } from "vitest"
import { CODEX_TYPES } from "@/db/codexTypes"
import { sortByPosition } from "@/db/order"
import { findStructure } from "@/features/plan/structures"
import { createTestDb } from "@/test/sqliteDb"
import { createBook, restoreBook, setBookStructure, trashBook, updateBook } from "./mutations"

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

test("a book started from a structure gets its acts and a chapter per structure moment", async () => {
  const structure = findStructure("three_act")!
  const { bookId, chapterId } = await createBook(db, { title: "Shaped", targetWords: 80_000, structure })
  expect(await db.get("SELECT template_key FROM books WHERE id = ?", [bookId])).toEqual({ template_key: "three_act" })
  type Act = { id: string; title: string; position: string }
  const acts = sortByPosition(await db.getAll<Act>("SELECT id, title, position FROM acts WHERE book_id = ?", [bookId]))
  expect(acts.map((act) => act.title)).toEqual(["Act I — Setup", "Act II — Confrontation", "Act III — Resolution"])
  type Chapter = { id: string; act_id: string; title: string; position: string; template_beat_key: string }
  const chapters = await db.getAll<Chapter & { word_target: number }>(
    "SELECT id, act_id, title, position, template_beat_key, word_target FROM chapters WHERE book_id = ?",
    [bookId],
  )
  const inAct = (act: Act) => sortByPosition(chapters.filter((chapter) => chapter.act_id === act.id))
  expect(acts.map((act) => inAct(act).map((chapter) => chapter.title))).toEqual([
    ["Setup", "Inciting incident"],
    ["First turning point", "Rising action", "Midpoint"],
    ["Second turning point", "Climax", "Resolution"],
  ])
  const first = inAct(acts[0])[0]
  expect(first).toMatchObject({ id: chapterId, template_beat_key: "setup", word_target: 10_000 })
})

test("a structure without acts gives chapters outside any act", async () => {
  const structure = { ...findStructure("story_circle")!, acts: [] }
  const { bookId } = await createBook(db, { title: "Loose", targetWords: null, structure })
  expect(await db.getAll("SELECT id FROM acts")).toEqual([])
  const chapters = await db.getAll<{ act_id: string | null; word_target: number }>(
    "SELECT act_id, word_target FROM chapters WHERE book_id = ?",
    [bookId],
  )
  expect(chapters).toHaveLength(structure.beats.length)
  expect(chapters.every((chapter) => chapter.act_id === null && chapter.word_target === 3000)).toBe(true)
})

test("the book's structure is stored by its current key, and can be cleared", async () => {
  const { bookId } = await createBook(db, { title: "Draft", targetWords: null })
  const key = async () => (await db.get<{ template_key: string | null }>("SELECT template_key FROM books")).template_key
  await setBookStructure(db, bookId, "save_the_cat")
  expect(await key()).toBe("fifteen_beat")
  await setBookStructure(db, bookId, "custom:abc")
  expect(await key()).toBe("custom:abc")
  await setBookStructure(db, bookId, null)
  expect(await key()).toBeNull()
})

test("premise and synopsis save with the other book settings", async () => {
  const { bookId } = await createBook(db, { title: "Draft", targetWords: null })
  await updateBook(db, bookId, { premise: "A keeper's daughter reads a ledger.", synopsis: "It begins. It ends." })
  expect(await db.get("SELECT premise, synopsis FROM books WHERE id = ?", [bookId])).toEqual({
    premise: "A keeper's daughter reads a ledger.",
    synopsis: "It begins. It ends.",
  })
})

test("AI style settings save with the other book settings", async () => {
  const { bookId } = await createBook(db, { title: "Draft", targetWords: null })
  await updateBook(db, bookId, {
    pov: "first",
    tense: "past",
    audience: "adult",
    style_guide: "Lean and specific.",
    sample_passages: JSON.stringify(["One", "Two"]),
  })
  expect(await db.get("SELECT pov, tense, audience, style_guide, sample_passages FROM books WHERE id = ?", [bookId]))
    .toEqual({
      pov: "first",
      tense: "past",
      audience: "adult",
      style_guide: "Lean and specific.",
      sample_passages: JSON.stringify(["One", "Two"]),
    })
})

test("update, trash, undo and restore", async () => {
  const { bookId } = await createBook(db, { title: "Draft", targetWords: null })
  await updateBook(db, bookId, { title: "Final", author: "Ann Lee", genre: "Mystery", target_words: 70_000 })
  const row = () =>
    db.get<{ deleted_at: string | null }>(
      "SELECT title, author, genre, target_words, deleted_at FROM books WHERE id = ?",
      [bookId],
    )
  const before = await row()
  expect(before).toEqual({ title: "Final", author: "Ann Lee", genre: "Mystery", target_words: 70_000, deleted_at: null })

  const changes = await trashBook(db, bookId)
  expect((await row()).deleted_at).not.toBeNull()
  await db.writeTransaction((tx) => changes.revert(tx))
  expect(await row()).toEqual(before)

  await trashBook(db, bookId)
  await restoreBook(db, bookId)
  expect(await row()).toEqual(before)
})
