import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { insertRow, updateRow } from "@/db/tx"
import { buildBook } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  isWrite,
  parseWrite,
  recordingOf,
  retractEdit,
  skipHistory,
  watchWrites,
  type Recording,
  type RecordingContext,
  type WriteWatcher,
} from "./recorder"
import { makeStep } from "./steps"

const BOOK: RecordingContext = { bookId: "book", universeId: "universe" }

let db: ReturnType<typeof createTestDb>
let context: RecordingContext | null
let recorded: Recording[]
let events: string[]
let watcher: WriteWatcher

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "A", beats: ["x"] }, { title: "B" }] })
  context = BOOK
  recorded = []
  events = []
  watcher = watchWrites(db, {
    context: () => context,
    finish: makeStep,
    recorded: (recording) => recorded.push(recording),
    writeStarted: () => events.push("start"),
    writeEnded: (ok) => events.push(ok ? "ok" : "failed"),
  })
})
afterEach(() => {
  watcher.stop()
  db.close()
  vi.restoreAllMocks()
})

const chapter = (id: string) => db.get<Record<string, unknown>>("SELECT * FROM chapters WHERE id = ?", [id])

// ── Reading the app's SQL ───────────────────────────────────────────────────

test("reads the app's three shapes of write", () => {
  expect(parseWrite("INSERT INTO chapters (title, id, notes) VALUES (?, ?, ?)", ["T", "c1", ""])).toEqual({
    kind: "insert",
    table: "chapters",
    id: "c1",
  })
  expect(parseWrite("UPDATE chapters SET title = ?, summary = ? WHERE id = ?", ["T", "S", "c1"])).toEqual({
    kind: "update",
    table: "chapters",
    where: "id = ?",
    whereParameters: ["c1"],
  })
  expect(parseWrite("UPDATE chapters SET act_id = NULL, title = 'a WHERE b' WHERE act_id = ?", ["a1"])).toEqual({
    kind: "update",
    table: "chapters",
    where: "act_id = ?",
    whereParameters: ["a1"],
  })
  expect(
    parseWrite("DELETE FROM beats WHERE parent_id IN (SELECT value FROM json_each(?)) AND done = ?", ["[]", 0]),
  ).toEqual({
    kind: "delete",
    table: "beats",
    where: "parent_id IN (SELECT value FROM json_each(?)) AND done = ?",
    whereParameters: ["[]", 0],
  })
})

test("tells reads and other tables apart from what it can't follow", () => {
  expect(parseWrite("SELECT * FROM chapters WHERE id = ?", ["c1"])).toEqual({ kind: "other" })
  expect(parseWrite("INSERT INTO ui_prefs (id, value) VALUES (?, ?)", ["k", "v"])).toEqual({ kind: "other" })
  expect(parseWrite("DELETE FROM scene_updates WHERE scene_id = ?", ["s"])).toEqual({ kind: "other" })
  expect(parseWrite("INSERT INTO universes (id, name) VALUES (?, ?)", ["u", "U"])).toEqual({ kind: "untrackable" })
  expect(parseWrite("UPDATE templates SET name = ? WHERE id = ?", ["n", "t"])).toEqual({ kind: "untrackable" })
  for (const sql of [
    "INSERT OR REPLACE INTO chapters (id) VALUES (?)",
    "INSERT INTO chapters (id, title) SELECT id, title FROM acts",
    "INSERT INTO chapters (title) VALUES (?)",
    "UPDATE chapters SET title = ?1 WHERE id = ?2",
    "UPDATE chapters SET title = :title WHERE id = :id",
    "UPDATE chapters SET title = ?",
    "DELETE FROM chapters",
    "REPLACE INTO chapters (id) VALUES (?)",
    "WITH gone AS (SELECT id FROM acts) DELETE FROM chapters WHERE act_id IN gone",
  ]) {
    expect(parseWrite(sql, ["x", "y"]), sql).toEqual({ kind: "unreadable" })
  }
})

test("knows a write from a read", () => {
  expect(isWrite("  update chapters SET title = ? WHERE id = ?")).toBe(true)
  expect(isWrite("WITH x AS (SELECT 1) INSERT INTO acts (id) VALUES (?)")).toBe(true)
  expect(isWrite("SELECT 'DELETE' AS word")).toBe(false)
  expect(isWrite("WITH x AS (SELECT 'UPDATE') SELECT * FROM x")).toBe(false)
})

// ── Recording ───────────────────────────────────────────────────────────────

test("records the rows an edit's transaction touched, as they were before it and after", async () => {
  const before = await chapter("ch-B")
  await db.writeTransaction(async (tx) => {
    expect(recordingOf(tx)).toBeDefined()
    await updateRow(tx, "chapters", "ch-A", { title: "A2" })
    await updateRow(tx, "chapters", "ch-A", { summary: "Gulls" })
    await insertRow(tx, "beats", { id: "beat-new", parent_kind: "chapter", parent_id: "ch-A", position: "b", text: "" })
    await tx.execute("DELETE FROM chapters WHERE id = ?", ["ch-B"])
  })
  expect(recorded).toHaveLength(1)
  const [{ changes, step }] = recorded
  expect([...changes.keys()]).toEqual(["chapters ch-A", "beats beat-new", "chapters ch-B"])
  expect(changes.get("chapters ch-A")).toMatchObject({
    before: { title: "A", summary: "" },
    after: { title: "A2", summary: "Gulls" },
  })
  expect(changes.get("beats beat-new")).toMatchObject({ before: null, after: { text: "" } })
  expect(changes.get("chapters ch-B")).toEqual({ table: "chapters", id: "ch-B", before, after: null })
  expect(step?.changes).toHaveLength(3)
  expect(step?.label).toBe("Deleted “B”")
  expect(events).toEqual(["start", "ok"])
})

test("records a write made on its own, and leaves reads and other tables be", async () => {
  await updateRow(db, "chapters", "ch-A", { status: "drafted" })
  expect(recorded).toHaveLength(1)
  expect(recorded[0].step?.label).toBe("Changed the status of “A”")
  await db.execute("SELECT * FROM chapters")
  await db.execute("INSERT INTO ui_prefs (id, value) VALUES (?, ?)", ["k", "v"])
  expect(recorded).toHaveLength(1)
  expect(events).toEqual(["start", "ok", "start", "ok"])
})

test("records nothing with no book open, for an edit left out, or for one Undo can't put back whole", async () => {
  context = null
  await db.writeTransaction(async (tx) => {
    expect(recordingOf(tx)).toBeUndefined()
    await updateRow(tx, "chapters", "ch-A", { title: "Home" })
  })
  context = BOOK
  await db.writeTransaction(async (tx) => {
    skipHistory(tx)
    await updateRow(tx, "chapters", "ch-A", { title: "Skipped" })
  })
  await db.writeTransaction(async (tx) => {
    await updateRow(tx, "chapters", "ch-A", { title: "With a universe" })
    await updateRow(tx, "universes", "universe", { name: "Renamed" })
  })
  expect(recorded).toEqual([])
  expect((await chapter("ch-A")).title).toBe("With a universe")
  expect(events).toEqual(["start", "ok", "start", "ok", "start", "ok"])
})

test("leaves out edits to another book, even in the same World", async () => {
  await buildBook(db, { chapters: [{ title: "Z", beats: ["z"] }] }, "other")
  recorded = []
  await updateRow(db, "chapters", "ch-Z", { title: "Elsewhere" })
  await updateRow(db, "beats", "beat-Z-1", { done: 1 })
  await updateRow(db, "books", "other", { genre: "Noir" })
  expect(recorded).toEqual([])
  await updateRow(db, "beats", "beat-A-1", { done: 1 })
  expect(recorded).toHaveLength(1)
})

test("an edit that undoes nothing but the app's own counts isn't recorded", async () => {
  await buildBook(db, { chapters: [{ title: "C", scenes: [{ title: "Dock" }] }] }, "other")
  context = { bookId: "other", universeId: "universe" }
  await updateRow(db, "scenes", "sc-C-1", { word_count: 120, ai_word_count: 3 })
  expect(recorded).toEqual([])
})

test("marks an edit that takes back an earlier one", async () => {
  await db.writeTransaction(async (tx) => {
    retractEdit(tx)
    await updateRow(tx, "chapters", "ch-A", { title: "Back" })
  })
  expect(recorded[0].retract).toBe(true)
})

test("reports every write as it starts and ends, a failed one as failed", async () => {
  context = null
  await expect(
    db.writeTransaction(async (tx) => {
      await updateRow(tx, "chapters", "ch-A", { title: "Lost" })
      throw new Error("disk full")
    }),
  ).rejects.toThrow("disk full")
  context = BOOK
  await expect(
    db.writeTransaction(async () => {
      throw new Error("again")
    }),
  ).rejects.toThrow("again")
  expect(events).toEqual(["start", "failed", "start", "failed"])
  expect((await chapter("ch-A")).title).toBe("A")
  expect(recorded).toEqual([])
})

test("a slip in following an edit costs Undo the edit, not the writer", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
  watcher.stop()
  watcher = watchWrites(db, {
    context: () => context,
    finish: async () => {
      throw new Error("bug")
    },
    recorded: (recording) => recorded.push(recording),
  })
  await updateRow(db, "chapters", "ch-A", { title: "Kept" })
  await db.writeTransaction(async (tx) => {
    await tx.execute("UPDATE chapters SET title = ?1 WHERE id = ?2", ["Kept too", "ch-B"])
  })
  expect((await chapter("ch-A")).title).toBe("Kept")
  expect((await chapter("ch-B")).title).toBe("Kept too")
  expect(recorded).toEqual([])
  expect(error).toHaveBeenCalledTimes(2)
})

test("records Undo's own edits for whichever book, without counting them as new edits", async () => {
  context = null
  const { result, recording } = await watcher.record(BOOK, async (tx) => {
    await updateRow(tx, "chapters", "ch-A", { title: "Put back" })
    return "done"
  })
  expect(result).toBe("done")
  expect(recording.step?.label).toBe("Renamed “A”")
  expect(recorded).toEqual([])
  expect(events).toEqual(["start", "ok"])
})

test("stop puts the database's own methods back", async () => {
  watcher.stop()
  await updateRow(db, "chapters", "ch-A", { title: "Unwatched" })
  expect(recorded).toEqual([])
  expect(events).toEqual([])
})
