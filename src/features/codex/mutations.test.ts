import { afterEach, beforeEach, expect, test } from "vitest"
import { insertRow } from "@/db/tx"
import { createTestDb } from "@/test/sqliteDb"
import { createCodexEntry } from "./mutations"

let db: ReturnType<typeof createTestDb>
beforeEach(async () => {
  db = createTestDb()
  await insertRow(db, "universes", { id: "u", name: "World" })
  await insertRow(db, "books", { id: "book", universe_id: "u", title: "Book" })
})
afterEach(() => db.close())

test("quick-create adds an entry of the type to the book's universe, creating the type if needed", async () => {
  const first = await createCodexEntry(db, { bookId: "book", typeKey: "plot_threads", name: " Revenge ", color: "#C2557A" })
  const second = await createCodexEntry(db, { bookId: "book", typeKey: "plot_threads", name: "Escape", color: "#2A8C8C" })
  const types = await db.getAll<{ id: string; key: string }>("SELECT id, key FROM codex_types")
  expect(types).toEqual([{ id: expect.any(String), key: "plot_threads" }])
  const entries = await db.getAll("SELECT id, universe_id, type_id, name, color FROM codex_entries ORDER BY name")
  expect(entries).toEqual([
    { id: second, universe_id: "u", type_id: types[0].id, name: "Escape", color: "#2A8C8C" },
    { id: first, universe_id: "u", type_id: types[0].id, name: "Revenge", color: "#C2557A" },
  ])
})
