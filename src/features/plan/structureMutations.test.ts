import { afterEach, beforeEach, expect, test } from "vitest"
import { createBook, setBookStructure } from "@/features/books/mutations"
import { createTestDb } from "@/test/sqliteDb"
import { createStructure, deleteStructure, updateStructure } from "./structureMutations"
import { structureFromRow, type StructureDraft } from "./structures"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const draft = (name: string): StructureDraft => ({
  name,
  acts: [
    { title: "After", pct: 50 },
    { title: "Before", pct: 0 },
  ],
  beats: [
    { key: "", name: "The fall", pct: 75, description: "" },
    { key: "", name: "The hook", pct: 5, description: "Something odd." },
  ],
})

const stored = async (id: string) =>
  structureFromRow(await db.get<{ id: string; name: string; beats: string }>("SELECT * FROM templates WHERE id = ?", [id]))

test("a new structure is saved with its acts and moments in book order", async () => {
  const { id, key, name } = await createStructure(db, draft("  Two halves "))
  expect(name).toBe("Two halves")
  expect(key).toBe(`custom:${id}`)
  expect(await db.get("SELECT kind, owner_id FROM templates WHERE id = ?", [id])).toEqual({
    kind: "overlay",
    owner_id: null,
  })
  const structure = await stored(id)
  expect(structure).toMatchObject({ key, name: "Two halves", templateId: id })
  expect(structure!.acts.map((act) => act.title)).toEqual(["Before", "After"])
  expect(structure!.beats).toEqual([
    { key: "the_hook", name: "The hook", pct: 5, description: "Something odd." },
    { key: "the_fall", name: "The fall", pct: 75, description: "" },
  ])
})

test("names stay unique among the writer's structures and the built-ins", async () => {
  expect((await createStructure(db, draft("Mine"))).name).toBe("Mine")
  expect((await createStructure(db, draft("mine"))).name).toBe("mine 2")
  expect((await createStructure(db, draft("Three-act structure"))).name).toBe("Three-act structure 2")
  const { id } = await createStructure(db, draft("Other"))
  expect(await updateStructure(db, id, draft("Other"))).toBe("Other")
  expect(await updateStructure(db, id, draft("MINE"))).toBe("MINE 3")
})

test("a structure without a named moment isn't saved", async () => {
  const empty = { name: "Nothing", acts: [], beats: [{ key: "", name: " ", pct: 10, description: "" }] }
  await expect(createStructure(db, empty)).rejects.toThrow("at least one moment")
  expect(await db.getAll("SELECT id FROM templates")).toEqual([])
})

test("editing keeps the keys of the moments it still has", async () => {
  const { id } = await createStructure(db, draft("Mine"))
  const before = (await stored(id))!
  const hook = before.beats[0]
  await updateStructure(db, id, {
    name: "Mine",
    acts: [],
    beats: [
      { ...hook, name: "The hook, renamed", pct: 10 },
      { key: "", name: "New", pct: 50, description: "" },
    ],
  })
  const after = (await stored(id))!
  expect(after.acts).toEqual([])
  expect(after.beats.map((item) => [item.key, item.name])).toEqual([
    ["the_hook", "The hook, renamed"],
    ["new", "New"],
  ])
})

test("deleting a structure unsets it on the books that follow it, and Undo puts both back", async () => {
  const { id, key } = await createStructure(db, draft("Mine"))
  const { bookId } = await createBook(db, { title: "Uses it", targetWords: null })
  const { bookId: otherId } = await createBook(db, { title: "Doesn't", targetWords: null })
  await setBookStructure(db, bookId, key)
  await setBookStructure(db, otherId, "three_act")
  const books = () => db.getAll("SELECT title, template_key FROM books ORDER BY title")
  const before = await books()

  const changes = await deleteStructure(db, id)
  expect(await db.getAll("SELECT id FROM templates")).toEqual([])
  expect(await books()).toEqual([
    { title: "Doesn't", template_key: "three_act" },
    { title: "Uses it", template_key: null },
  ])

  await db.writeTransaction((tx) => changes.revert(tx))
  expect(await books()).toEqual(before)
  expect((await stored(id))?.name).toBe("Mine")
})
