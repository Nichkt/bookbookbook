import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { daysLeft, emptyTrash, purgeExpiredTrash, purgeItem } from "./trash"
import { insertRow } from "./tx"
import { buildBook } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const NOW = new Date("2025-03-31T12:00:00.000Z")
const OLD = "2025-02-01T00:00:00.000Z"
const RECENT = "2025-03-30T00:00:00.000Z"
const ids = async (table: string) =>
  (await db.getAll<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)).map((row) => row.id)

test("daysLeft counts down from 30", () => {
  expect(daysLeft("2025-03-31T12:00:00.000Z", NOW.getTime())).toBe(30)
  expect(daysLeft("2025-03-02T00:00:00.000Z", NOW.getTime())).toBe(1)
  expect(daysLeft(OLD, NOW.getTime())).toBe(0)
  expect(daysLeft("not a date", NOW.getTime())).toBe(30)
})

describe("purgeExpiredTrash", () => {
  test("deletes chapters and scenes older than 30 days with everything attached", async () => {
    await buildBook(db, {
      chapters: [
        { title: "Old", beats: ["b"], threads: ["ledger"], scenes: [{ title: "s", written: true }] },
        { title: "Recent" },
        { title: "Kept", scenes: [{ title: "old scene", written: true }, { title: "recent scene" }] },
      ],
    })
    await db.execute("UPDATE chapters SET deleted_at = ? WHERE id = 'ch-Old'", [OLD])
    await db.execute("UPDATE chapters SET deleted_at = ? WHERE id = 'ch-Recent'", [RECENT])
    await db.execute("UPDATE scenes SET deleted_at = ? WHERE id = 'sc-Kept-1'", [OLD])
    await db.execute("UPDATE scenes SET deleted_at = ? WHERE id = 'sc-Kept-2'", [RECENT])
    await insertRow(db, "scene_updates", { id: "u1", scene_id: "sc-Old-1", update_b64: "" })
    await insertRow(db, "mention_index", { id: "m1", scene_id: "sc-Kept-1", entry_id: "mara", count: 1 })

    await purgeExpiredTrash(db, NOW)
    expect(await ids("chapters")).toEqual(["ch-Kept", "ch-Recent"])
    expect(await ids("scenes")).toEqual(["sc-Kept-2"])
    for (const table of ["beats", "entity_links", "snapshots", "scene_updates", "mention_index"]) {
      expect(await ids(table)).toEqual([])
    }
  })

  test("deletes expired books with their universe unless another book shares it", async () => {
    await buildBook(db, { chapters: [{ title: "A", scenes: [{ title: "s" }] }] }, "book")
    await insertRow(db, "books", { id: "sibling", universe_id: "universe", title: "Same world" })
    await insertRow(db, "codex_entries", { id: "mara", universe_id: "universe", name: "Mara" })
    await insertRow(db, "acts", { id: "act", book_id: "book", title: "", position: "a0" })
    await insertRow(db, "ui_prefs", { id: "plan.view:book", value: "outline" })
    await insertRow(db, "ui_prefs", { id: "plan.view:sibling", value: "board" })
    await db.execute("UPDATE books SET deleted_at = ? WHERE id = 'book'", [OLD])

    await purgeExpiredTrash(db, NOW)
    expect(await ids("books")).toEqual(["sibling"])
    for (const table of ["chapters", "scenes", "acts"]) expect(await ids(table)).toEqual([])
    expect(await ids("ui_prefs")).toEqual(["plan.view:sibling"])
    expect(await ids("universes")).toEqual(["universe"])
    expect(await ids("codex_entries")).toEqual(["mara"])

    await db.execute("UPDATE books SET deleted_at = ? WHERE id = 'sibling'", [OLD])
    await purgeExpiredTrash(db, NOW)
    for (const table of ["books", "universes", "codex_entries", "ui_prefs"]) expect(await ids(table)).toEqual([])
  })
})

test("emptyTrash clears this book's Trash and trashed books, nothing else", async () => {
  await buildBook(db, { chapters: [{ title: "A", deleted: true }, { title: "B", scenes: [{ title: "s", deleted: true }] }] })
  await buildBook(db, { chapters: [{ title: "Other", deleted: true }] }, "other")
  await insertRow(db, "books", { id: "binned", universe_id: "universe", title: "Binned", deleted_at: RECENT })

  await emptyTrash(db, "book")
  expect(await ids("chapters")).toEqual(["ch-B", "ch-Other"])
  expect(await ids("scenes")).toEqual([])
  expect(await ids("books")).toEqual(["book", "other"])
})

test("purgeItem deletes one item", async () => {
  await buildBook(db, { chapters: [{ title: "A", scenes: [{ title: "s" }, { title: "t" }] }] })
  await purgeItem(db, "scene", "sc-A-1")
  expect(await ids("scenes")).toEqual(["sc-A-2"])
  await purgeItem(db, "chapter", "ch-A")
  expect(await ids("scenes")).toEqual([])
  await purgeItem(db, "book", "book")
  expect(await ids("universes")).toEqual([])
})
