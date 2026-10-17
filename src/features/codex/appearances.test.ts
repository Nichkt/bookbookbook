import { afterEach, beforeEach, expect, test } from "vitest"
import { buildMentionMatcher, EMPTY_MATCHER } from "@/editor/mentions"
import { storedSceneReader } from "@/export/scenes"
import { buildBook } from "@/test/book"
import { heading, paras, text, writeProse } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import {
  APPEARANCE_ACTS_SQL,
  APPEARANCE_CHAPTERS_SQL,
  buildAppearances,
  countMentions,
  PLAN_LINKS_SQL,
  type AppearanceActRow,
  type AppearanceChapterRow,
  type PlanLinkRow,
} from "./appearances"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const matcher = buildMentionMatcher([
  { id: "mara", name: "Mara", aliases: [] },
  { id: "jonas", name: "Jonas Quill", aliases: ["Jonas"] },
  { id: "harbor", name: "Harbor", aliases: [] },
])

async function book() {
  await buildBook(db, {
    acts: [
      {
        title: "I",
        chapters: [
          {
            title: "Arrival",
            pov: "mara",
            location: "harbor",
            threads: ["ledger"],
            present: ["jonas"],
            scenes: [{ title: "a" }, { title: "b", pov: "jonas" }],
          },
          { title: "Storm", scenes: [{ title: "a" }, { title: "gone", deleted: true }] },
        ],
      },
      {
        title: "II",
        chapters: [
          { title: "Calm", scenes: [{ title: "a" }] },
          { title: "Binned", pov: "mara", deleted: true, scenes: [{ title: "a" }] },
        ],
      },
    ],
  })
  await writeProse(db, "sc-Arrival-1", paras("Mara stepped off. Mara's bag fell."))
  await writeProse(db, "sc-Arrival-2", paras("Jonas Quill waved. Jonas laughed."))
  await writeProse(db, "sc-Storm-1", [heading(2, text("The Harbor")), ...paras("Mara and Jonas ran.", "MARA screamed.")])
  await writeProse(db, "sc-Storm-2", paras("Mara, in the Trash."))
  await writeProse(db, "sc-Calm-1", paras("Nothing happened."))
  await writeProse(db, "sc-Binned-1", paras("Mara, in a chapter in the Trash."))
}

const counts = (result: Awaited<ReturnType<typeof countMentions>>) =>
  Object.fromEntries([...result].map(([entryId, byChapter]) => [entryId, Object.fromEntries(byChapter)]))

test("counts each entry's mentions by chapter, as the editor underlines them, leaving out the Trash", async () => {
  await book()
  const result = await countMentions(db, "book", matcher, storedSceneReader(db))
  expect(counts(result)).toEqual({
    mara: { "ch-Arrival": 2, "ch-Storm": 1 },
    jonas: { "ch-Arrival": 2, "ch-Storm": 1 },
    harbor: { "ch-Storm": 1 },
  })
})

test("doesn't read the prose when no entry has a name to find", async () => {
  expect((await countMentions(db, "no such book", EMPTY_MATCHER, storedSceneReader(db))).size).toBe(0)
})

test("lists where each entry appears, in reading order, with the plan's links", async () => {
  await book()
  const appearances = buildAppearances(
    await db.getAll<AppearanceActRow>(APPEARANCE_ACTS_SQL, ["book"]),
    await db.getAll<AppearanceChapterRow>(APPEARANCE_CHAPTERS_SQL, ["book"]),
    await db.getAll<PlanLinkRow>(PLAN_LINKS_SQL, ["book", "book", "book", "book"]),
    await countMentions(db, "book", matcher, storedSceneReader(db)),
  )
  const arrival = { chapterId: "ch-Arrival", number: 1, title: "Arrival" }
  const storm = { chapterId: "ch-Storm", number: 2, title: "Storm" }
  expect(Object.fromEntries(appearances)).toEqual({
    mara: [
      { ...arrival, mentions: 2, roles: ["pov"] },
      { ...storm, mentions: 1, roles: [] },
    ],
    jonas: [
      { ...arrival, mentions: 2, roles: ["pov", "present"] },
      { ...storm, mentions: 1, roles: [] },
    ],
    harbor: [
      { ...arrival, mentions: 0, roles: ["location"] },
      { ...storm, mentions: 1, roles: [] },
    ],
    ledger: [{ ...arrival, mentions: 0, roles: ["thread"] }],
  })
})

test("numbers chapters as the planner does and trims titles", () => {
  const chapters = [
    { id: "b", act_id: null, position: "a1", title: " Second " },
    { id: "a", act_id: null, position: "a0", title: null },
  ]
  const mentions = new Map([["mara", new Map([["b", 3]])]])
  expect(buildAppearances([], chapters, [{ chapter_id: "a", entry_id: "mara", role: "other" }], mentions)).toEqual(
    new Map([["mara", [{ chapterId: "b", number: 2, title: "Second", mentions: 3, roles: [] }]]]),
  )
})
