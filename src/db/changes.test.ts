import { afterEach, beforeEach, expect, test } from "vitest"
import { ChangeSet } from "./changes"
import { insertRow, updateRow } from "./tx"
import { createTestDb } from "@/test/sqliteDb"

let db: ReturnType<typeof createTestDb>
beforeEach(async () => {
  db = createTestDb()
  for (const [id, title] of [
    ["a", "Alpha"],
    ["b", "Beta"],
    ["c", "Gamma"],
  ]) {
    await insertRow(db, "acts", { id, book_id: "book", title, position: `a${id === "a" ? 0 : id === "b" ? 1 : 2}` })
  }
})
afterEach(() => db.close())

const acts = () => db.getAll("SELECT * FROM acts ORDER BY id")

test("revert undoes updates, deletes and inserts exactly", async () => {
  const before = await acts()
  const changes = new ChangeSet()
  expect(changes.isEmpty).toBe(true)
  await db.writeTransaction(async (tx) => {
    await changes.captureIds(tx, "acts", ["a", "b"])
    await changes.capture(tx, "acts", "title = ?", ["Gamma"])
    await updateRow(tx, "acts", "a", { title: "Changed", position: "a5" })
    await updateRow(tx, "acts", "a", { title: "Changed twice" })
    // Capturing again after a change keeps the first state.
    await changes.captureIds(tx, "acts", ["a"])
    await tx.execute("DELETE FROM acts WHERE id = 'b'")
    await updateRow(tx, "acts", "c", { title: null })
    changes.created("acts", "d")
    await insertRow(tx, "acts", { id: "d", book_id: "book", title: "New", position: "a3" })
  })
  expect(changes.isEmpty).toBe(false)
  await db.writeTransaction((tx) => changes.revert(tx))
  expect(await acts()).toEqual(before)
})

test("revert tolerates rows that changed again since", async () => {
  const before = await acts()
  const changes = new ChangeSet()
  await db.writeTransaction(async (tx) => {
    await changes.captureIds(tx, "acts", ["a"])
    await tx.execute("DELETE FROM acts WHERE id = 'a'")
    changes.created("acts", "d")
    await insertRow(tx, "acts", { id: "d", book_id: "book", title: "New", position: "a3" })
  })
  // Another device already removed the created row.
  await db.execute("DELETE FROM acts WHERE id = 'd'")
  await db.writeTransaction((tx) => changes.revert(tx))
  expect(await acts()).toEqual(before)
})
