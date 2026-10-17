import { describe, expect, test } from "vitest"
import { plainToRichText } from "@/lib/richText"
import { buildCodex, type CodexEntry, type CodexEntryRow, type CodexTypeRow } from "./codexData"
import {
  entryLabel,
  isFiltering,
  isStayState,
  listEntries,
  neighborOf,
  NO_FILTER,
  NO_TYPE,
  nounOf,
  removedFieldMessage,
  resolveList,
  STAY_STATE,
  typeNameError,
} from "./screenRules"

const typeRow = (id: string, name: string): CodexTypeRow => ({
  id,
  key: null,
  name,
  icon: null,
  field_schema: null,
  builtin: 0,
})

const entryRow = (
  id: string,
  typeId: string | null,
  name: string,
  values: Partial<CodexEntryRow> = {},
): CodexEntryRow => ({
  id,
  type_id: typeId,
  name,
  aliases: null,
  tags: null,
  fields: null,
  notes: null,
  ai_context: null,
  color: null,
  ...values,
})

const types = [typeRow("people", "People"), typeRow("places", "Places")]
const codex = buildCodex(types, [
  entryRow("thomas", "people", "Thomas Quill", {
    tags: JSON.stringify(["family", "keeper"]),
    fields: JSON.stringify({ Role: "Lighthouse keeper" }),
  }),
  entryRow("mara", "people", "Mara Quill", { aliases: JSON.stringify(["Mar"]), tags: JSON.stringify(["Family"]) }),
  entryRow("grayhaven", "places", "Grayhaven", { notes: plainToRichText("An island off the salt coast.") }),
  entryRow("stray", "gone", "Lost letter"),
])
const names = (entries: readonly CodexEntry[]) => entries.map((entry) => entry.name)

describe("resolveList", () => {
  test("keeps the type asked for while it's there", () => {
    expect(resolveList(codex, "places")).toBe("places")
  })

  test("falls back to the first type when nothing was asked for or the type is gone", () => {
    expect(resolveList(codex, null)).toBe("people")
    expect(resolveList(codex, "ships")).toBe("people")
  })

  test("keeps the list of entries without a type only while there are some", () => {
    expect(resolveList(codex, NO_TYPE)).toBe(NO_TYPE)
    expect(resolveList(buildCodex(types, []), NO_TYPE)).toBe("people")
  })

  test("is the no-type list when there are no types at all", () => {
    expect(resolveList(buildCodex([], []), null)).toBe(NO_TYPE)
  })
})

describe("listEntries", () => {
  test("shows the chosen type's entries by name, or none for a list that's gone", () => {
    expect(names(listEntries(codex, "people", NO_FILTER))).toEqual(["Mara Quill", "Thomas Quill"])
    expect(names(listEntries(codex, NO_TYPE, NO_FILTER))).toEqual(["Lost letter"])
    expect(listEntries(codex, "ships", NO_FILTER)).toEqual([])
  })

  test("searches every type: names, aliases, tags, fields and notes", () => {
    expect(names(listEntries(codex, "places", { query: "quill", tag: null }))).toEqual(["Mara Quill", "Thomas Quill"])
    expect(names(listEntries(codex, "places", { query: "MAR", tag: null }))).toEqual(["Mara Quill"])
    expect(names(listEntries(codex, "places", { query: "lighthouse", tag: null }))).toEqual(["Thomas Quill"])
    expect(names(listEntries(codex, "people", { query: " island ", tag: null }))).toEqual(["Grayhaven"])
  })

  test("filters by tag ignoring case, together with the search", () => {
    expect(names(listEntries(codex, "places", { query: "", tag: "FAMILY" }))).toEqual(["Mara Quill", "Thomas Quill"])
    expect(names(listEntries(codex, "places", { query: "thomas", tag: "family" }))).toEqual(["Thomas Quill"])
    expect(listEntries(codex, "places", { query: "", tag: "coast" })).toEqual([])
  })

  test("doesn't count a blank search as filtering", () => {
    expect(isFiltering({ query: "  ", tag: null })).toBe(false)
    expect(isFiltering({ query: "", tag: "family" })).toBe(true)
    expect(names(listEntries(codex, "places", { query: "  ", tag: null }))).toEqual(["Grayhaven"])
  })
})

describe("neighborOf", () => {
  const list = listEntries(codex, "people", NO_FILTER)
  const [mara, thomas] = list

  test("picks the entry after, else the one before", () => {
    expect(neighborOf(list, "mara")).toBe(thomas)
    expect(neighborOf(list, "thomas")).toBe(mara)
  })

  test("is the first entry when the one leaving isn't listed, and null when nothing is left", () => {
    expect(neighborOf(list, "grayhaven")).toBe(mara)
    expect(neighborOf(list.slice(0, 1), "mara")).toBeNull()
    expect(neighborOf([], "mara")).toBeNull()
  })
})

test("isStayState recognizes only the state that keeps an empty list on screen", () => {
  expect(isStayState(STAY_STATE)).toBe(true)
  expect(isStayState({ focus: "heading" })).toBe(false)
  expect(isStayState(null)).toBe(false)
  expect(isStayState(undefined)).toBe(false)
  expect(isStayState("codexStay")).toBe(false)
})

test("nounOf lowercases a type's name for mid-sentence, but not its acronyms", () => {
  expect(nounOf("Plot threads")).toBe("plot threads")
  expect(nounOf("Lore / Magic / Tech")).toBe("lore / magic / tech")
  expect(nounOf("NPCs")).toBe("NPCs")
  expect(nounOf("AI cores")).toBe("AI cores")
  expect(nounOf("A Ship")).toBe("a ship")
})

test("entryLabel quotes a name, and describes an entry without one", () => {
  const [unnamed] = buildCodex(types, [entryRow("blank", "people", "  ")]).entries
  expect(entryLabel(codex.entryById.get("mara")!, "Person")).toBe("“Mara Quill”")
  expect(entryLabel(unnamed!, "Plot thread")).toBe("the unnamed plot thread")
  expect(entryLabel(unnamed!, undefined)).toBe("the unnamed entry")
})

test("removedFieldMessage says how many entries kept their text", () => {
  expect(removedFieldMessage("Age", "Characters", 0)).toBe("Removed “Age” from Characters")
  expect(removedFieldMessage("Age", "Characters", 2)).toBe(
    "Removed “Age” from Characters, except 2 that filled it in",
  )
})

describe("typeNameError", () => {
  const existing = [
    { id: "ships", name: "Ships" },
    { id: "gods", name: "Gods" },
  ]

  test("asks for a name when it's blank", () => {
    expect(typeNameError("", existing, null)).toBe("Give the type a name.")
    expect(typeNameError("   ", existing, "ships")).toBe("Give the type a name.")
  })

  test("refuses another type's name, ignoring case and spaces", () => {
    expect(typeNameError(" ships ", existing, null)).toBe("There's a type called “Ships” already.")
    expect(typeNameError("GODS", existing, "ships")).toBe("There's a type called “Gods” already.")
  })

  test("accepts a new name, or a type keeping its own", () => {
    expect(typeNameError("Moons", existing, null)).toBeNull()
    expect(typeNameError("SHIPS", existing, "ships")).toBeNull()
  })
})
