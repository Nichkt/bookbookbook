import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { CODEX_TYPES, insertBuiltinCodexTypes } from "@/db/codexTypes"
import { insertRow } from "@/db/tx"
import { colorFor } from "@/lib/palette"
import { plainToRichText } from "@/lib/richText"
import { createTestDb } from "@/test/sqliteDb"
import {
  buildCodex,
  CODEX_ENTRIES_SQL,
  CODEX_TYPES_SQL,
  codexPath,
  entryFieldLabels,
  entryMatches,
  entryTerms,
  fieldValue,
  initials,
  isTracked,
  parseFields,
  parseFieldSchema,
  sharedTerms,
  singularOf,
  typeSingular,
  type CodexEntry,
  type CodexEntryRow,
  type CodexType,
  type CodexTypeRow,
} from "./codexData"

let db: ReturnType<typeof createTestDb>
let typeIds: Map<string, string>
beforeEach(async () => {
  db = createTestDb()
  await insertRow(db, "universes", { id: "u", name: "World" })
  await insertRow(db, "universes", { id: "other", name: "Elsewhere" })
  await insertRow(db, "books", { id: "book", universe_id: "u", title: "Book" })
  typeIds = await db.writeTransaction((tx) => insertBuiltinCodexTypes(tx, "u"))
})
afterEach(() => db.close())

const load = async () =>
  buildCodex(
    await db.getAll<CodexTypeRow>(CODEX_TYPES_SQL, ["book"]),
    await db.getAll<CodexEntryRow>(CODEX_ENTRIES_SQL, ["book"]),
  )

const entry = (values: Partial<CodexEntry>): CodexEntry => ({
  id: "e",
  typeId: null,
  name: "Mara Quill",
  named: true,
  aliases: [],
  tags: [],
  fields: {},
  notes: "",
  aiContext: "mentioned",
  color: "#2A8C8C",
  ...values,
})

test("lists the universe's types: the built-in ones in their order, then the writer's own by name", async () => {
  await insertRow(db, "codex_types", { id: "ships", universe_id: "u", key: null, name: "Ships", builtin: 0 })
  await insertRow(db, "codex_types", { id: "gods", universe_id: "u", key: null, name: "gods", builtin: 0 })
  await insertRow(db, "codex_types", { id: "far", universe_id: "other", key: null, name: "Moons", builtin: 0 })

  const { types, typeById } = await load()
  expect(types.map((type) => type.name)).toEqual([...CODEX_TYPES.map((type) => type.name), "gods", "Ships"])
  expect(types.map((type) => type.singular)).toEqual([
    "Character",
    "Location",
    "Object",
    "Faction",
    "Lore",
    "Event",
    "Plot thread",
    "Theme",
    "god",
    "Ship",
  ])
  expect(types.map((type) => type.tracked)).toEqual([true, true, true, true, true, false, false, false, true, true])
  expect(types.map((type) => type.builtin)).toEqual([...CODEX_TYPES.map(() => true), false, false])
  expect(typeById.get(typeIds.get("characters")!)).toMatchObject({ icon: "user-round", key: "characters" })
  expect(typeById.get(typeIds.get("characters")!)?.fields).toHaveLength(8)
  expect(typeById.get("ships")).toMatchObject({ icon: "shapes", key: "", fields: [] })
})

test("parses entries, leaving out the Trash and other universes", async () => {
  const characters = typeIds.get("characters")!
  await insertRow(db, "codex_entries", {
    id: "mara",
    universe_id: "u",
    type_id: characters,
    name: " Mara Quill ",
    aliases: '["Mara", 7, "Quill"]',
    tags: '["crew", "Lead"]',
    fields: '{"Role": "Pilot", "Age": 31, "Ship": "Gull"}',
    notes: plainToRichText("Born at sea.\n\nHates bells."),
    ai_context: "always",
    color: "#C2557A",
  })
  await insertRow(db, "codex_entries", {
    id: "blank",
    universe_id: "u",
    name: "  ",
    tags: '["Crew"]',
    fields: "not json",
    ai_context: "sometimes",
  })
  await insertRow(db, "codex_entries", { id: "salt", universe_id: "u", type_id: "gone", name: "Salt" })
  await insertRow(db, "codex_entries", { id: "binned", universe_id: "u", name: "Binned", deleted_at: "2025-01-01" })
  await insertRow(db, "codex_entries", { id: "far", universe_id: "other", name: "Far" })

  const codex = await load()
  expect(codex.entries.map((item) => item.id)).toEqual(["mara", "salt", "blank"])
  expect(codex.entryById.get("mara")).toEqual({
    id: "mara",
    typeId: characters,
    name: "Mara Quill",
    named: true,
    aliases: ["Mara", "Quill"],
    tags: ["crew", "Lead"],
    fields: { Role: "Pilot", Ship: "Gull" },
    notes: "Born at sea.\n\nHates bells.",
    aiContext: "always",
    color: "#C2557A",
  })
  expect(codex.entryById.get("blank")).toMatchObject({
    name: "Unnamed",
    named: false,
    fields: {},
    notes: "",
    aiContext: "mentioned",
    color: colorFor("Unnamed"),
  })
  expect(codex.entryById.get("salt")?.typeId).toBeNull()
  expect(codex.entriesByType.get(characters)?.map((item) => item.id)).toEqual(["mara"])
  expect(codex.entriesByType.get("")?.map((item) => item.id)).toEqual(["salt", "blank"])
  expect(codex.tags).toEqual(["crew", "Lead"])
})

test("sorts entries by name, ignoring case and counting numbers", () => {
  const rows = ["ship 10", "Ship 2", "anchor"].map((name, index) => ({ id: `${index}`, name }) as CodexEntryRow)
  expect(buildCodex([], rows).entries.map((item) => item.name)).toEqual(["anchor", "Ship 2", "ship 10"])
})

test("singularOf makes a singular for a type the writer names", () => {
  const cases = {
    Ships: "Ship",
    Cities: "City",
    Witches: "Witch",
    Boxes: "Box",
    Classes: "Class",
    Houses: "House",
    Keys: "Key",
    NPCs: "NPC",
    Elves: "Elf",
    ELVES: "ELF",
    "Dark elves": "Dark elf",
    People: "Person",
    Species: "Species",
    Status: "Status",
    Glass: "Glass",
    Magic: "Magic",
    "Magic systems": "Magic system",
    "Places of power": "Places of power",
    "": "",
  }
  for (const [plural, singular] of Object.entries(cases)) expect(singularOf(plural), plural).toBe(singular)
})

describe("JSON columns", () => {
  test("parseFieldSchema keeps each label once, skipping blanks and junk", () => {
    const schema = [{ label: " Role ", kind: "text" }, { label: " " }, { kind: "text" }, "Age", { label: "Role" }]
    expect(parseFieldSchema(JSON.stringify(schema))).toEqual(["Role"])
    expect(parseFieldSchema("{}")).toEqual([])
    expect(parseFieldSchema("nope")).toEqual([])
    expect(parseFieldSchema(null)).toEqual([])
  })

  test("parseFields keeps string values", () => {
    expect(parseFields('{"Role": "Pilot", "Age": 31, "Ship": null}')).toEqual({ Role: "Pilot" })
    expect(parseFields('["Role"]')).toEqual({})
    expect(parseFields("nope")).toEqual({})
  })
})

test("entryFieldLabels lists the type's fields, then the entry's own", () => {
  const type = { fields: ["Role", "Age"] } as Parameters<typeof entryFieldLabels>[1]
  expect(entryFieldLabels(entry({ fields: { Ship: "Gull", age: "31", Role: "Pilot" } }), type)).toEqual([
    "Role",
    "Age",
    "Ship",
  ])
  expect(entryFieldLabels(entry({ fields: { Ship: "Gull" } }), undefined)).toEqual(["Ship"])
})

test("entryMatches searches names, aliases, tags, fields and notes, ignoring case", () => {
  const mara = entry({ aliases: ["The Gull"], tags: ["crew"], fields: { Role: "Pilot" }, notes: "Hates bells." })
  for (const query of ["", "  ", "mara", "GULL", "Crew", "pilot", "bells"]) {
    expect(entryMatches(mara, query), query).toBe(true)
  }
  expect(entryMatches(mara, "harbor")).toBe(false)
})

test("initials", () => {
  expect(initials("Mara Quill")).toBe("MQ")
  expect(initials("Salt")).toBe("S")
  expect(initials("the old Black Gull")).toBe("TG")
  expect(initials("élodie d'Arc")).toBe("ÉA")
  expect(initials("  ")).toBe("?")
})

test("typeSingular names one entry of a type", () => {
  expect(typeSingular({ key: "lore", name: "Lore / Magic / Tech", builtin: 1 })).toBe("Lore")
  expect(typeSingular({ key: "plot_threads", name: "Plot threads", builtin: true })).toBe("Plot thread")
  expect(typeSingular({ key: null, name: " Ships ", builtin: 0 })).toBe("Ship")
  expect(typeSingular({ key: "characters", name: "Crew", builtin: 0 })).toBe("Crew")
  expect(typeSingular({ key: "moons", name: "Moons", builtin: 1 })).toBe("Moon")
  expect(typeSingular({ key: null, name: "  ", builtin: null })).toBe("Untitled type")
})

test("fieldValue matches the label exactly, then ignoring case", () => {
  const mara = entry({ fields: { Role: "Pilot", role: "Cook", age: "31" } })
  expect(fieldValue(mara, "Role")).toBe("Pilot")
  expect(fieldValue(mara, "role")).toBe("Cook")
  expect(fieldValue(mara, "Age")).toBe("31")
  expect(fieldValue(mara, "Ship")).toBe("")
  expect(fieldValue(mara, "constructor")).toBe("")
})

test("codexPath", () => {
  expect(codexPath("b1")).toBe("/b/b1/codex")
  expect(codexPath("b1", null)).toBe("/b/b1/codex")
  expect(codexPath("b1", "e1")).toBe("/b/b1/codex/e1")
})

describe("names the text underlines", () => {
  const type = (id: string, tracked: boolean) => ({ id, tracked }) as CodexType
  const typeById = new Map([
    ["people", type("people", true)],
    ["themes", type("themes", false)],
  ])

  test("isTracked: entries of tracked types and entries without a type", () => {
    expect(isTracked({ typeById }, entry({ typeId: "people" }))).toBe(true)
    expect(isTracked({ typeById }, entry({ typeId: null }))).toBe(true)
    expect(isTracked({ typeById }, entry({ typeId: "themes" }))).toBe(false)
  })

  test("entryTerms: the name, if it has one, and the aliases long enough to find", () => {
    expect(entryTerms(entry({ aliases: [" Mara ", "Q", "Mara Quill", ""] }))).toEqual(["Mara Quill", "Mara"])
    expect(entryTerms(entry({ name: "Unnamed", named: false, aliases: ["The Gull"] }))).toEqual(["The Gull"])
  })

  test("sharedTerms: names another underlined entry has too", () => {
    const mara = entry({ id: "mara", typeId: "people", aliases: ["Mara", "Gull"] })
    const twin = entry({ id: "twin", typeId: "people", name: "Mara", aliases: ["Gull"] })
    const ship = entry({ id: "ship", typeId: null, name: "The Gull", aliases: ["Gull"] })
    const theme = entry({ id: "theme", typeId: "themes", name: "Mara Quill" })
    const entries = [mara, twin, ship, theme]
    expect(sharedTerms({ entries, typeById }, mara)).toEqual([
      { term: "Mara", others: [twin] },
      { term: "Gull", others: [twin, ship] },
    ])
    expect(sharedTerms({ entries, typeById }, theme)).toEqual([])
    expect(sharedTerms({ entries: [mara, theme], typeById }, mara)).toEqual([])
  })
})
