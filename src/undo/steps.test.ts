import { afterEach, beforeEach, expect, test } from "vitest"
import type { ChapterRow } from "@/db/schema"
import { insertRow, updateRow, type Tx } from "@/db/tx"
import { buildBook, chapterRow } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import { watchWrites, type Recording, type Row, type RowChange } from "./recorder"
import { compose, makeStep, netChanges, revertStep, type Step } from "./steps"

let db: ReturnType<typeof createTestDb>
beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, {
    acts: [{ title: "One", chapters: [{ title: "A", beats: ["x"] }, { title: "B", scenes: [{ title: "Dock" }] }] }],
  })
})
afterEach(() => db.close())

const row = (values: Record<string, string | number | null>): Row => ({ id: "r", ...values })
const change = (before: Row | null, after: Row | null, table = "chapters"): RowChange => ({
  table,
  id: (before ?? after)?.id ?? "r",
  before,
  after,
})

const recording = (changes: RowChange[]): Recording => ({
  bookId: "book",
  universeId: "universe",
  changes: new Map(changes.map((c) => [`${c.table} ${c.id}`, c])),
  skip: false,
  retract: false,
})

/** The step `edit` comes to, as the recorder makes it. */
async function stepOf(edit: (tx: Tx) => Promise<unknown>): Promise<Step> {
  let step: Step | undefined
  const watcher = watchWrites(db, {
    context: () => ({ bookId: "book", universeId: "universe" }),
    finish: makeStep,
    recorded: (recorded) => (step = recorded.step),
  })
  try {
    await db.writeTransaction(edit)
  } finally {
    watcher.stop()
  }
  if (!step) throw new Error("The edit came to no step")
  return step
}

const revert = (step: Step) => db.writeTransaction((tx) => revertStep(tx, step))

test("net changes drop rows made and deleted in one go, and changes that come to nothing", () => {
  expect(netChanges([change(null, null)])).toEqual([])
  expect(netChanges([change(row({ title: "A" }), row({ title: "A" }))])).toEqual([])
  const retitled = change(row({ title: "A", summary: null }), row({ title: "B", summary: null }))
  expect(netChanges([retitled])).toEqual([{ ...retitled, columns: ["title"] }])
  expect(netChanges([change(null, row({ title: "A" }))])[0].columns).toEqual([])
})

test("net changes leave out the counts the app keeps by itself", () => {
  const counted = change(row({ word_count: 1, ai_word_count: 0 }), row({ word_count: 9, ai_word_count: 2 }), "scenes")
  expect(netChanges([counted])).toEqual([])
  const retitled = change(row({ word_count: 1, title: "a" }), row({ word_count: 9, title: "b" }), "scenes")
  expect(netChanges([retitled])[0].columns).toEqual(["title"])
})

test("composes edits into what they come to together", () => {
  const made = change(null, row({ title: "A" }))
  const retitled = change(row({ title: "A" }), row({ title: "B" }))
  expect(compose([made], [retitled])).toEqual([{ ...made, after: retitled.after, columns: [] }])
  expect(compose([made], [change(row({ title: "B" }), null)])).toEqual([])
  expect(compose([retitled], [change(row({ title: "B" }), row({ title: "A" }))])).toEqual([])
})

test("a step comes to nothing without changes, or when it reaches outside the book", async () => {
  expect(await db.writeTransaction((tx) => makeStep(tx, recording([])))).toBeNull()
  await buildBook(db, { chapters: [{ title: "Z", beats: ["z"], scenes: [{ title: "Far" }] }] }, "other")
  const beat = await db.get<Row>("SELECT * FROM beats WHERE id = 'beat-Z-1'")
  const scene = await db.get<Row>("SELECT * FROM scenes WHERE id = 'sc-Z-1'")
  for (const foreign of [
    change(beat, { ...beat, done: 1 }, "beats"),
    change(scene, { ...scene, title: "Near" }, "scenes"),
    change(row({ id: "other", title: "T" }), row({ id: "other", title: "U" }), "books"),
    change(null, row({ id: "n", book_id: "other", text: "" }), "inbox_notes"),
    change(null, row({ id: "e", universe_id: "elsewhere", name: "Mara" }), "codex_entries"),
  ]) {
    expect(await db.writeTransaction((tx) => makeStep(tx, recording([foreign]))), foreign.table).toBeNull()
  }
  const own = await db.get<Row>("SELECT * FROM beats WHERE id = 'beat-A-1'")
  const step = await db.writeTransaction((tx) => makeStep(tx, recording([change(own, { ...own, done: 1 }, "beats")])))
  expect(step).toMatchObject({ bookId: "book", universeId: "universe", label: "Marked a moment done in “A”" })
})

test("undoing puts back only what's still as the step left it", async () => {
  const step = await stepOf((tx) => updateRow(tx, "chapters", "ch-A", { title: "A2", summary: "Gulls" }))
  await updateRow(db, "chapters", "ch-A", { title: "Since" })
  expect(await revert(step)).toEqual({ conflicts: 1 })
  expect(await chapterRow(db, "ch-A")).toMatchObject({ title: "Since", summary: "" })
})

test("undoing removes rows the step made, or puts them in the Trash once something hangs off them", async () => {
  const { id: _id, ...chapter }: ChapterRow = await chapterRow(db, "ch-A")
  const step = await stepOf(async (tx) => {
    await insertRow(tx, "chapters", { ...chapter, id: "ch-new", title: "New", position: "a5" })
    await insertRow(tx, "chapters", { ...chapter, id: "ch-bare", title: "Bare", position: "a6" })
  })
  await insertRow(db, "scenes", { id: "sc-new", chapter_id: "ch-new", position: "a0", title: "", is_implicit: 1 })
  expect(await revert(step)).toEqual({ conflicts: 0 })
  expect((await chapterRow(db, "ch-new")).deleted_at).toBeTruthy()
  expect(await db.getOptional("SELECT id FROM chapters WHERE id = 'ch-bare'")).toBeNull()
})

test("undoing leaves a row it made that can't go to the Trash while something hangs off it, and counts it", async () => {
  const step = await stepOf((tx) =>
    insertRow(tx, "acts", { id: "act-new", book_id: "book", title: "Two", position: "a9" }),
  )
  await updateRow(db, "chapters", "ch-B", { act_id: "act-new" })
  expect(await revert(step)).toEqual({ conflicts: 1 })
  expect(await db.getOptional("SELECT id FROM acts WHERE id = 'act-new'")).not.toBeNull()
})

test("undoing brings back rows the step deleted, as they were", async () => {
  await insertRow(db, "inbox_notes", { id: "note", book_id: "book", text: "Gulls", source: "typed" })
  const before = await db.get("SELECT * FROM inbox_notes WHERE id = 'note'")
  const step = await stepOf((tx) => tx.execute("DELETE FROM inbox_notes WHERE id = ?", ["note"]))
  expect(step.label).toBe("Deleted a note")
  expect(await revert(step)).toEqual({ conflicts: 0 })
  expect(await db.get("SELECT * FROM inbox_notes WHERE id = 'note'")).toEqual(before)
})
