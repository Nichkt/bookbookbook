import { afterEach, beforeEach, expect, test } from "vitest"
import { ensureScene } from "@/db/queries"
import { sortByPosition } from "@/db/order"
import { createBook } from "@/features/books/mutations"
import { createTestDb } from "@/test/sqliteDb"
import { findStructure } from "./structures"
import { addBeat, createAct, createChapter, createScene, trashChapter, updateChapter } from "./mutations"
import {
  applyWizard,
  BLANK_CHAPTER_SQL,
  joinSynopsis,
  newWizardDraft,
  parseWizardDraft,
  seedWizardActs,
  wizardMessage,
  wizardPlan,
  type WizardPlan,
} from "./wizard"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const PARTS = [
  "Mara takes over her father's lighthouse",
  "She finds a ledger of ships that never existed.",
  "",
  "The ledger names her as its next keeper!",
  "  She   burns it ",
]

test("the five sentences join into a paragraph, each with an ending", () => {
  expect(joinSynopsis(PARTS)).toBe(
    "Mara takes over her father's lighthouse. She finds a ledger of ships that never existed. " +
      "The ledger names her as its next keeper! She burns it.",
  )
  expect(joinSynopsis(["Is it?", "“Yes”", " "])).toBe("Is it? “Yes”")
  expect(joinSynopsis(["", " "])).toBe("")
})

test("the sentences suggest a chapter each, in three acts", () => {
  const acts = seedWizardActs(PARTS)
  expect(acts.map((act) => act.title)).toEqual(["Act I — Setup", "Act II — Confrontation", "Act III — Resolution"])
  expect(acts.map((act) => act.chapters.map((chapter) => [chapter.title, chapter.summary]))).toEqual([
    [
      ["Beginning", "Mara takes over her father's lighthouse"],
      ["First disaster", "She finds a ledger of ships that never existed."],
    ],
    [["Third disaster", "The ledger names her as its next keeper!"]],
    [["Ending", "She burns it"]],
  ])
  // Fixed ids, so the list keeps its keys once the writer changes it.
  expect(seedWizardActs(PARTS)).toEqual(acts)
})

test("a saved draft reads back, and junk doesn't", () => {
  const draft = { ...newWizardDraft("A premise"), step: 2, parts: PARTS }
  expect(parseWizardDraft(JSON.stringify(draft))).toEqual(draft)
  for (const junk of [null, "", "{", "[]", "3"]) expect(parseWizardDraft(junk)).toBeNull()
  const odd = parseWizardDraft(JSON.stringify({ step: 9, parts: ["One"], characters: [], acts: [{ chapters: [{}] }] }))
  expect(odd).toMatchObject({ step: 3, premise: "", parts: ["One", "", "", "", ""], addChapters: true })
  expect(odd?.characters).toHaveLength(1)
  expect(odd?.acts).toEqual([
    { id: expect.any(String), title: "", chapters: [{ id: expect.any(String), title: "", summary: "" }] },
  ])
})

test("the plan tidies the draft, drops nameless characters, and leaves out the chapters if asked", () => {
  const draft = {
    ...newWizardDraft("  A keeper's   daughter reads a ledger. "),
    parts: PARTS,
    characters: [
      { id: "a", name: " Mara ", role: "Lead", goal: " Keep the light " },
      { id: "b", name: " ", role: "Nobody", goal: "" },
    ],
  }
  const plan = wizardPlan(draft)
  expect(plan.premise).toBe("A keeper's daughter reads a ledger.")
  expect(plan.synopsis).toBe(joinSynopsis(PARTS))
  expect(plan.characters).toEqual([{ name: "Mara", role: "Lead", goal: "Keep the light" }])
  expect(plan.acts.map((act) => act.chapters.length)).toEqual([2, 1, 1])
  expect(wizardPlan({ ...draft, addChapters: false }).acts).toEqual([])
})

test("the message says what was added, and owns up to replacing a synopsis", () => {
  const plan = { premise: "A premise.", synopsis: "It begins. It ends." }
  const none = { chapters: 0, characters: 0 }
  expect(wizardMessage({ chapters: 2, characters: 1 }, plan, null)).toBe("Added 2 chapters and 1 character")
  expect(wizardMessage({ chapters: 1, characters: 0 }, plan, " It begins. It ends. ")).toBe("Added 1 chapter")
  expect(wizardMessage({ chapters: 0, characters: 3 }, plan, "Something else.")).toBe(
    "Added 3 characters, and replaced your synopsis",
  )
  expect(wizardMessage(none, plan, "Something else.")).toBe("Saved your premise and replaced your synopsis")
  expect(wizardMessage(none, { ...plan, premise: "" }, "Something else.")).toBe("Replaced your synopsis")
  expect(wizardMessage(none, plan, "")).toBe("Saved your premise and synopsis")
  // A plan without a synopsis keeps the book's.
  expect(wizardMessage(none, { ...plan, synopsis: "" }, "Something else.")).toBe("Saved your premise")
  expect(wizardMessage(none, { ...plan, premise: "" }, null)).toBe("Saved your synopsis")
})

const PLAN: WizardPlan = {
  premise: "A keeper's daughter reads a ledger.",
  synopsis: "It begins. It ends.",
  characters: [
    { name: "Mara", role: "Lead", goal: "Keep the light" },
    { name: "Tobin", role: "", goal: "" },
  ],
  acts: [
    { title: "Act I", chapters: [{ title: "Beginning", summary: "It begins." }] },
    { title: "Empty", chapters: [] },
    {
      title: "Act II",
      chapters: [
        { title: "Middle", summary: "" },
        { title: "Ending", summary: "It ends." },
      ],
    },
  ],
}

type Chapter = { id: string; act_id: string | null; title: string; summary: string; position: string }

async function outline(bookId: string) {
  const acts = sortByPosition(
    await db.getAll<{ id: string; title: string; position: string }>("SELECT * FROM acts WHERE book_id = ?", [bookId]),
  )
  const chapters = sortByPosition(
    await db.getAll<Chapter>("SELECT * FROM chapters WHERE book_id = ? AND deleted_at IS NULL", [bookId]),
  )
  if (acts.length === 0) return [{ act: null, chapters: chapters.map((chapter) => chapter.title) }]
  return acts.map((act) => ({
    act: act.title,
    chapters: chapters.filter((chapter) => chapter.act_id === act.id).map((chapter) => chapter.title),
  }))
}

const snapshot = async () => ({
  books: await db.getAll("SELECT * FROM books ORDER BY id"),
  acts: await db.getAll("SELECT * FROM acts ORDER BY id"),
  chapters: await db.getAll("SELECT * FROM chapters ORDER BY id"),
  entries: await db.getAll("SELECT * FROM codex_entries ORDER BY id"),
  types: await db.getAll("SELECT * FROM codex_types ORDER BY id"),
})

test("a new book's blank chapter makes way for the plan, and Undo brings it back", async () => {
  const { bookId, chapterId } = await createBook(db, { title: "Ledger", targetWords: 90_000 })
  const before = await snapshot()

  const result = await applyWizard(db, bookId, PLAN)
  expect(result).toMatchObject({ chapters: 3, characters: 2, replacedBlank: true })
  expect(await db.getOptional("SELECT id FROM chapters WHERE id = ?", [chapterId])).toBeNull()
  expect(await outline(bookId)).toEqual([
    { act: "Act I", chapters: ["Beginning"] },
    { act: "Act II", chapters: ["Middle", "Ending"] },
  ])
  const chapters = await db.getAll<{ summary: string; word_target: number }>(
    "SELECT summary, word_target FROM chapters WHERE book_id = ? ORDER BY title",
    [bookId],
  )
  expect(chapters).toEqual([
    { summary: "It begins.", word_target: 30_000 },
    { summary: "It ends.", word_target: 30_000 },
    { summary: "", word_target: 30_000 },
  ])
  expect(await db.get("SELECT premise, synopsis FROM books WHERE id = ?", [bookId])).toEqual({
    premise: PLAN.premise,
    synopsis: PLAN.synopsis,
  })
  const entries = await db.getAll<{ name: string; fields: string; color: string; key: string }>(
    `SELECT e.name, e.fields, e.color, t.key FROM codex_entries e JOIN codex_types t ON t.id = e.type_id
     ORDER BY e.name`,
  )
  expect(entries.map(({ name, fields, key }) => ({ name, fields: JSON.parse(fields), key }))).toEqual([
    { name: "Mara", fields: { Role: "Lead", Goal: "Keep the light" }, key: "characters" },
    { name: "Tobin", fields: {}, key: "characters" },
  ])
  expect(entries[0].color).not.toBe(entries[1].color)

  await db.writeTransaction((tx) => result.changes.revert(tx))
  expect(await snapshot()).toEqual(before)
})

test("a blank chapter opened for writing goes to the Trash, into the first act", async () => {
  const { bookId, chapterId } = await createBook(db, { title: "Ledger", targetWords: null })
  await ensureScene(db, chapterId)
  await applyWizard(db, bookId, PLAN)
  const chapter = await db.get<{ act_id: string; deleted_at: string | null }>("SELECT * FROM chapters WHERE id = ?", [
    chapterId,
  ])
  expect(chapter.deleted_at).not.toBeNull()
  const first = sortByPosition(await db.getAll<{ id: string; position: string }>("SELECT * FROM acts"))[0]
  expect(chapter.act_id).toBe(first.id)
})

test("a planned book keeps its chapters; the new acts go after its own", async () => {
  const { bookId } = await createBook(db, { title: "Shaped", targetWords: 80_000, structure: findStructure("three_act") })
  const before = await outline(bookId)
  const result = await applyWizard(db, bookId, { ...PLAN, premise: "", synopsis: "" })
  expect(result.replacedBlank).toBe(false)
  expect(await outline(bookId)).toEqual([
    ...before,
    { act: "Act I", chapters: ["Beginning"] },
    { act: "Act II", chapters: ["Middle", "Ending"] },
  ])
  const added = await db.getAll<{ word_target: number }>("SELECT word_target FROM chapters WHERE title = 'Middle'")
  expect(added).toEqual([{ word_target: 3000 }])
  // An empty premise or synopsis keeps the book's.
  expect(await db.get("SELECT premise, synopsis FROM books WHERE id = ?", [bookId])).toEqual({
    premise: null,
    synopsis: null,
  })
})

test("a chapter with anything planned or written in it isn't blank", async () => {
  const marks: [string, (chapterId: string) => Promise<unknown>][] = [
    ["nothing", async () => {}],
    ["a title", (id) => updateChapter(db, id, { title: "Mine" })],
    ["a summary", (id) => updateChapter(db, id, { summary: "Something happens." })],
    ["a label", (id) => updateChapter(db, id, { labels: '["draft"]' })],
    ["a structure moment", (id) => updateChapter(db, id, { template_beat_key: "catalyst" })],
    ["a moment", (id) => addBeat(db, id, 0, "Find the key")],
    ["a scene", (id) => createScene(db, id)],
    ["words", (id) => ensureScene(db, id).then(() => db.execute("UPDATE scenes SET word_count = 3"))],
  ]
  const blank: string[] = []
  for (const [mark, apply] of marks) {
    const { bookId, chapterId } = await createBook(db, { title: mark, targetWords: null })
    await apply(chapterId)
    if (await db.getOptional(BLANK_CHAPTER_SQL, [bookId])) blank.push(mark)
    await db.execute("DELETE FROM scenes")
  }
  expect(blank).toEqual(["nothing"])
  const { bookId, chapterId } = await createBook(db, { title: "Two", targetWords: null })
  await createChapter(db, bookId, { actId: null })
  expect(await db.getOptional(BLANK_CHAPTER_SQL, [bookId])).toBeNull()
  await trashChapter(db, chapterId)
  expect(await db.getOptional(BLANK_CHAPTER_SQL, [bookId])).not.toBeNull()
})

test("a book without acts gets the chapters at its end, still without acts", async () => {
  const { bookId, chapterId } = await createBook(db, { title: "Loose", targetWords: null })
  await updateChapter(db, chapterId, { title: "Mine" })
  await createChapter(db, bookId, { actId: null }, { title: "Also mine" })
  const result = await applyWizard(db, bookId, PLAN)
  expect(result.replacedBlank).toBe(false)
  expect(await outline(bookId)).toEqual([
    { act: null, chapters: ["Mine", "Also mine", "Beginning", "Middle", "Ending"] },
  ])
})

test("acts the blank chapter leaves empty go, unless they have a name", async () => {
  const { bookId } = await createBook(db, { title: "Acts", targetWords: null })
  await createAct(db, bookId)
  await createAct(db, bookId, { title: "Prologue" })
  await applyWizard(db, bookId, PLAN)
  expect(await outline(bookId)).toEqual([
    { act: "Prologue", chapters: [] },
    { act: "Act I", chapters: ["Beginning"] },
    { act: "Act II", chapters: ["Middle", "Ending"] },
  ])
})

test("a plan with no chapters saves the rest and leaves the chapters alone", async () => {
  const { bookId } = await createBook(db, { title: "Words only", targetWords: null })
  const before = await outline(bookId)
  const result = await applyWizard(db, bookId, { ...PLAN, characters: [], acts: [] })
  expect(result).toMatchObject({ chapters: 0, characters: 0, replacedBlank: false })
  expect(await outline(bookId)).toEqual(before)
  expect(await db.get("SELECT premise FROM books WHERE id = ?", [bookId])).toEqual({ premise: PLAN.premise })
})

test("a World without a Characters type gets one, which Undo removes", async () => {
  const { bookId } = await createBook(db, { title: "No types", targetWords: null })
  await db.execute("DELETE FROM codex_types WHERE key = 'characters'")
  const before = await snapshot()
  const result = await applyWizard(db, bookId, { ...PLAN, acts: [] })
  expect(await db.getAll("SELECT name FROM codex_types WHERE key = 'characters'")).toEqual([{ name: "Characters" }])
  await db.writeTransaction((tx) => result.changes.revert(tx))
  expect(await snapshot()).toEqual(before)
})
