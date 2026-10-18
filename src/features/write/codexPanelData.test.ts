import { afterEach, beforeEach, expect, test } from "vitest"
import { insertRow } from "@/db/tx"
import { buildMentionMatcher, EMPTY_MATCHER } from "@/editor/mentions"
import { buildCodex, type CodexEntryRow, type CodexTypeRow } from "@/features/codex/codexData"
import { buildBook } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  CHAPTER_LINKS_SQL,
  chapterEntries,
  chapterEntryText,
  countMentionsIn,
  filledFields,
  typeGroups,
  type ChapterLinkRow,
} from "./codexPanelData"

const typeRows: CodexTypeRow[] = [
  { id: "t-place", key: "locations", name: "Locations", icon: "map-pin", field_schema: null, builtin: 1 },
  {
    id: "t-person",
    key: "characters",
    name: "Characters",
    icon: "user-round",
    field_schema: JSON.stringify([{ label: "Role" }, { label: "Age" }]),
    builtin: 1,
  },
  { id: "t-ship", key: "ships", name: "Ships", icon: "shapes", field_schema: null, builtin: 0 },
  { id: "t-lore", key: "lore", name: "Lore", icon: "sparkles", field_schema: null, builtin: 1 },
]

const row = (id: string, name: string, typeId: string | null, more: Partial<CodexEntryRow> = {}): CodexEntryRow => ({
  id,
  type_id: typeId,
  name,
  aliases: null,
  tags: null,
  fields: null,
  notes: null,
  ai_context: null,
  color: null,
  ...more,
})

const codex = buildCodex(typeRows, [
  row("mara", "Mara Quill", "t-person", { fields: JSON.stringify({ age: " ", Scar: "Left hand", role: "Cartographer" }) }),
  row("jonas", "Jonas", "t-person"),
  row("agnes", "Agnes", "t-person"),
  row("quay", "North Quay", "t-place"),
  row("gull", "The Gull", "t-ship"),
  row("lost", "Lost", "gone"),
])

test("counts the names the editor would underline, across the chapter's scenes", () => {
  const matcher = buildMentionMatcher([
    { id: "mara", name: "Mara Quill", aliases: ["Mara"] },
    { id: "jonas", name: "Jonas", aliases: [] },
  ])
  const counts = countMentionsIn(["Mara Quill waved.\nMara's bag fell.", "Jonas and Mara.", ""], matcher)
  expect(Object.fromEntries(counts)).toEqual({ mara: 3, jonas: 1 })
  expect(countMentionsIn(["Mara"], EMPTY_MATCHER).size).toBe(0)
})

test("lists the chapter's entries: the POV, the location, then by mentions and in the codex's order", () => {
  const mentions = new Map([
    ["jonas", 1],
    ["agnes", 1],
    ["gull", 3],
    ["quay", 2],
    ["trashed", 5],
    ["mara", 0],
  ])
  const links: ChapterLinkRow[] = [
    { entry_id: "mara", role: "present" },
    { entry_id: "mara", role: "pov" },
    { entry_id: "quay", role: "location" },
    { entry_id: "lost", role: "thread" },
    { entry_id: "trashed", role: "present" },
    { entry_id: "agnes", role: "something else" },
  ]
  const items = chapterEntries(codex, mentions, links)
  expect(items.map(({ entry, roles, mentions }) => [entry.id, roles, mentions])).toEqual([
    ["mara", ["pov", "present"], 0],
    ["quay", ["location"], 2],
    ["gull", [], 3],
    ["agnes", [], 1],
    ["jonas", [], 1],
    ["lost", ["thread"], 0],
  ])
  expect(chapterEntries(codex, new Map([["jonas", 0]]), [])).toEqual([])
})

test("describes an entry's part in the chapter", () => {
  expect(chapterEntryText({ roles: ["pov", "present"], mentions: 4 })).toBe("Point of view · Present · 4 mentions")
  expect(chapterEntryText({ roles: [], mentions: 1 })).toBe("1 mention")
  expect(chapterEntryText({ roles: ["thread"], mentions: 0 })).toBe("Story point")
})

test("groups the codex by type in the Codex's order, leaving out empty types, with lost types last", () => {
  const groups = typeGroups(codex).map(({ type, entries }) => [type?.name ?? null, entries.map((entry) => entry.id)])
  expect(groups).toEqual([
    ["Characters", ["agnes", "jonas", "mara"]],
    ["Locations", ["quay"]],
    ["Ships", ["gull"]],
    [null, ["lost"]],
  ])
})

test("shows the fields with something in them, the type's first, in the type's case", () => {
  const mara = codex.entryById.get("mara")!
  expect(filledFields(mara, codex.typeById.get("t-person"))).toEqual([
    { label: "Role", value: "Cartographer" },
    { label: "Scar", value: "Left hand" },
  ])
  expect(filledFields(codex.entryById.get("jonas")!, codex.typeById.get("t-person"))).toEqual([])
})

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

test("reads the chapter's plan links: POVs of it and its scenes, location, threads and who's present", async () => {
  await buildBook(db, {
    chapters: [
      {
        title: "Arrival",
        pov: "mara",
        location: "quay",
        threads: ["ledger"],
        present: ["jonas", "mara"],
        scenes: [{ title: "a", pov: "agnes" }, { title: "b", pov: "elias", deleted: true }, { title: "c", pov: "mara" }],
      },
      { title: "Storm", pov: "jonas", location: "sea", present: ["agnes"], scenes: [{ title: "a", pov: "gull" }] },
    ],
  })
  await insertRow(db, "entity_links", {
    id: "link-scene",
    book_id: "book",
    chapter_id: "ch-Arrival",
    scene_id: "sc-Arrival-1",
    entry_id: "gull",
    role: "present",
    source: "manual",
  })
  const rows = await db.getAll<ChapterLinkRow>(CHAPTER_LINKS_SQL, Array<string>(4).fill("ch-Arrival"))
  expect(rows.map((link) => `${link.role}:${link.entry_id}`).sort()).toEqual([
    "location:quay",
    "pov:agnes",
    "pov:mara",
    "present:jonas",
    "present:mara",
    "thread:ledger",
  ])
})
