import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { ChangeSet } from "@/db/changes"
import { insertBuiltinCodexTypes } from "@/db/codexTypes"
import { MENTION_ENTRIES_SQL } from "@/db/queries"
import { insertRow, updateRow } from "@/db/tx"
import { createTestDb } from "@/test/sqliteDb"
import { buildCodex, CODEX_ENTRIES_SQL, CODEX_TYPES_SQL, type CodexEntryRow, type CodexTypeRow } from "./codexData"
import {
  addTypeField,
  createCodexEntry,
  createCustomType,
  createEntry,
  deleteType,
  EMPTY_NOTES,
  removeEntryField,
  removeTypeField,
  renameType,
  restoreEntry,
  setEntryField,
  trashEntry,
  updateEntry,
} from "./mutations"

let db: ReturnType<typeof createTestDb>
beforeEach(async () => {
  db = createTestDb()
  await insertRow(db, "universes", { id: "u", name: "World" })
  await insertRow(db, "books", { id: "book", universe_id: "u", title: "Book" })
})
afterEach(() => db.close())

const load = async () =>
  buildCodex(
    await db.getAll<CodexTypeRow>(CODEX_TYPES_SQL, ["book"]),
    await db.getAll<CodexEntryRow>(CODEX_ENTRIES_SQL, ["book"]),
  )
const undo = (changes: ChangeSet) => db.writeTransaction((tx) => changes.revert(tx))
const builtins = () => db.writeTransaction((tx) => insertBuiltinCodexTypes(tx, "u"))
const newEntry = (name = "Mara", typeId: string | null = null) =>
  createEntry(db, { bookId: "book", typeId, name, color: "#2A8C8C" })

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

describe("entries", () => {
  test("createEntry adds a bare entry of any type to the book's universe, blank names included", async () => {
    const characters = (await builtins()).get("characters")!
    const unnamed = await newEntry("", characters)
    const salt = await newEntry(" Salt ")
    expect(
      await db.get(
        `SELECT universe_id, type_id, name, aliases, tags, fields, notes, ai_context, color, deleted_at
         FROM codex_entries WHERE id = ?`,
        [unnamed],
      ),
    ).toEqual({
      universe_id: "u",
      type_id: characters,
      name: "",
      aliases: "[]",
      tags: "[]",
      fields: "{}",
      notes: EMPTY_NOTES,
      ai_context: "mentioned",
      color: "#2A8C8C",
      deleted_at: null,
    })
    expect((await load()).entries.map((entry) => [entry.id, entry.name, entry.typeId])).toEqual([
      [salt, "Salt", null],
      [unnamed, "Unnamed", characters],
    ])
  })

  test("updateEntry changes only what it's given", async () => {
    const types = await builtins()
    const id = await newEntry()
    await updateEntry(db, id, {
      name: " Mara Quill ",
      aliases: [" Mara ", "mara", "", "Quill"],
      tags: ["crew", "Crew ", "lead"],
      notes: "Born at sea.\n\nHates bells.",
    })
    expect((await load()).entryById.get(id)).toMatchObject({
      name: "Mara Quill",
      typeId: null,
      aliases: ["Mara", "Quill"],
      tags: ["crew", "lead"],
      notes: "Born at sea.\n\nHates bells.",
      aiContext: "mentioned",
      color: "#2A8C8C",
    })

    await updateEntry(db, id, { typeId: types.get("characters")!, aiContext: "never", color: "#C2557A" })
    await updateEntry(db, id, {})
    expect((await load()).entryById.get(id)).toMatchObject({
      name: "Mara Quill",
      typeId: types.get("characters"),
      aliases: ["Mara", "Quill"],
      notes: "Born at sea.\n\nHates bells.",
      aiContext: "never",
      color: "#C2557A",
    })
  })

  test("fields saved at the same time all stick, and removing one keeps the rest", async () => {
    const id = await newEntry()
    await Promise.all([
      setEntryField(db, id, "Role", "Pilot"),
      setEntryField(db, id, "Ship", "Gull"),
      setEntryField(db, id, "Age", "31"),
    ])
    expect((await load()).entryById.get(id)?.fields).toEqual({ Role: "Pilot", Ship: "Gull", Age: "31" })
    await Promise.all([removeEntryField(db, id, "Ship"), setEntryField(db, id, "Role", "Captain")])
    expect((await load()).entryById.get(id)?.fields).toEqual({ Role: "Captain", Age: "31" })
    await setEntryField(db, "missing", "Role", "Pilot")
    expect(await db.getAll("SELECT id FROM codex_entries")).toEqual([{ id }])
  })

  test("setEntryField replaces a key that differs only in case, which the page shows as the same field", async () => {
    const id = await newEntry()
    await setEntryField(db, id, "owner", "Thomas")
    await setEntryField(db, id, "Age", "31")
    await setEntryField(db, id, "Owner", "Thomas Quill")
    expect((await load()).entryById.get(id)?.fields).toEqual({ Age: "31", Owner: "Thomas Quill" })
  })

  test("removeEntryField takes off the field the entry has, with Undo", async () => {
    const id = await newEntry()
    await setEntryField(db, id, "Ship", "Gull")
    await setEntryField(db, id, "Age", "31")
    expect((await removeEntryField(db, id, "ship")).isEmpty).toBe(true)
    expect((await removeEntryField(db, "missing", "Ship")).isEmpty).toBe(true)

    const changes = await removeEntryField(db, id, "Ship")
    expect((await load()).entryById.get(id)?.fields).toEqual({ Age: "31" })
    await undo(changes)
    expect((await load()).entryById.get(id)?.fields).toEqual({ Ship: "Gull", Age: "31" })
  })

  test("the Trash hides an entry from the Codex and the text, and Undo or Restore brings it back", async () => {
    const characters = (await builtins()).get("characters")!
    const id = await newEntry("Mara", characters)
    const visible = async () => ({
      codex: (await load()).entries.map((entry) => entry.id),
      mentions: (await db.getAll<{ id: string }>(MENTION_ENTRIES_SQL, ["book"])).map((row) => row.id),
    })
    expect(await visible()).toEqual({ codex: [id], mentions: [id] })

    const changes = await trashEntry(db, id)
    expect(await visible()).toEqual({ codex: [], mentions: [] })
    expect(await db.get("SELECT deleted_at IS NOT NULL AS trashed FROM codex_entries")).toEqual({ trashed: 1 })
    await undo(changes)
    expect(await visible()).toEqual({ codex: [id], mentions: [id] })

    await trashEntry(db, id)
    await restoreEntry(db, id)
    expect(await visible()).toEqual({ codex: [id], mentions: [id] })
  })
})

describe("types", () => {
  test("addTypeField adds a field to the type once, ignoring case", async () => {
    const places = (await builtins()).get("locations")!
    expect(await addTypeField(db, places, " Climate ")).toBe(true)
    expect(await addTypeField(db, places, "climate")).toBe(false)
    expect(await addTypeField(db, places, "history")).toBe(false)
    expect(await addTypeField(db, places, "  ")).toBe(false)
    expect(await addTypeField(db, "missing", "Climate")).toBe(false)
    expect((await load()).typeById.get(places)?.fields).toEqual(["Atmosphere", "Senses", "History", "Climate"])
    expect(await db.get("SELECT field_schema FROM codex_types WHERE id = ?", [places])).toEqual({
      field_schema: JSON.stringify(
        ["Atmosphere", "Senses", "History", "Climate"].map((label) => ({ label, kind: "text" })),
      ),
    })
  })

  test("removeTypeField takes a field off the type and the entry it's removed on; others that filled it in keep it", async () => {
    const types = await builtins()
    const places = types.get("locations")!
    const harbor = await newEntry("Harbor", places)
    const cove = await newEntry("Cove", places)
    const reef = await newEntry("Reef", places)
    const ruin = await newEntry("Ruin", places)
    const crew = await newEntry("Crew", types.get("factions")!)
    await setEntryField(db, harbor, "History", "Built on a wreck.")
    await setEntryField(db, cove, "History", "Smugglers.")
    // Both cases at once, as an import or a sync from elsewhere can leave them.
    await updateRow(db, "codex_entries", reef, { fields: JSON.stringify({ History: "  ", history: "" }) })
    await setEntryField(db, crew, "History", "")
    await setEntryField(db, ruin, "History", "Old.")
    await trashEntry(db, ruin)
    const fieldsOf = async () =>
      Object.fromEntries(
        (await db.getAll<{ name: string; fields: string }>("SELECT name, fields FROM codex_entries ORDER BY name")).map(
          (row) => [row.name, JSON.parse(row.fields) as unknown],
        ),
      )
    const before = await fieldsOf()

    expect((await removeTypeField(db, places, "Climate")).changes.isEmpty).toBe(true)
    expect((await removeTypeField(db, "missing", "History")).changes.isEmpty).toBe(true)
    const { changes, kept } = await removeTypeField(db, places, " history ", cove)
    expect(kept).toBe(1)
    expect((await load()).typeById.get(places)?.fields).toEqual(["Atmosphere", "Senses"])
    expect(await fieldsOf()).toEqual({
      Cove: {},
      Crew: { History: "" },
      Harbor: { History: "Built on a wreck." },
      Reef: {},
      Ruin: { History: "Old." },
    })

    await undo(changes)
    expect((await load()).typeById.get(places)?.fields).toEqual(["Atmosphere", "Senses", "History"])
    expect(await fieldsOf()).toEqual(before)
  })

  test("a type of the writer's own can be made, renamed, given fields and deleted, with Undo", async () => {
    await builtins()
    const ships = await createCustomType(db, { bookId: "book", name: " Ships " })
    expect((await load()).types.at(-1)).toMatchObject({
      id: ships,
      key: "",
      name: "Ships",
      singular: "Ship",
      icon: "shapes",
      fields: [],
      builtin: false,
      tracked: true,
    })
    await renameType(db, ships, " Vessels ")
    expect(await addTypeField(db, ships, "Captain")).toBe(true)
    expect((await load()).typeById.get(ships)).toMatchObject({ name: "Vessels", fields: ["Captain"] })

    const gull = await newEntry("Gull", ships)
    const wreck = await newEntry("Wreck", ships)
    await trashEntry(db, wreck)
    const changes = await deleteType(db, ships)
    expect((await load()).typeById.has(ships)).toBe(false)
    expect(await db.getAll("SELECT id, type_id FROM codex_entries ORDER BY name")).toEqual([
      { id: gull, type_id: null },
      { id: wreck, type_id: null },
    ])

    await undo(changes)
    expect((await load()).typeById.get(ships)).toMatchObject({ name: "Vessels", fields: ["Captain"] })
    expect(await db.getAll("SELECT id, type_id FROM codex_entries ORDER BY name")).toEqual([
      { id: gull, type_id: ships },
      { id: wreck, type_id: ships },
    ])
  })
})
