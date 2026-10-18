import { afterEach, beforeEach, expect, test } from "vitest"
import { INBOX_NOTES_SQL } from "@/features/inbox/inboxData"
import { parseStoryTime } from "@/features/plan/storyTime"
import { createTestDb } from "@/test/sqliteDb"
import { CHAPTERS_SQL, ensureScene, MENTION_ENTRIES_SQL, SCENES_SQL, type ChapterListRow } from "./queries"
import { SAMPLE_CHAPTERS, SAMPLE_CODEX, SAMPLE_INBOX } from "./sampleBook"
import { seedIfEmpty } from "./seed"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const bookId = async () => (await db.get<{ id: string }>("SELECT id FROM books")).id

test("seeds The Salt Ledger once", async () => {
  expect(await seedIfEmpty(db)).toBe(true)
  expect(await seedIfEmpty(db)).toBe(false)
  expect(await db.getAll("SELECT title FROM books")).toEqual([{ title: "The Salt Ledger" }])
})

test("twelve chapters in three acts, in reading order", async () => {
  await seedIfEmpty(db)
  const chapters = await db.getAll<ChapterListRow>(CHAPTERS_SQL, [await bookId()])
  expect(chapters.map((chapter) => chapter.title)).toEqual(SAMPLE_CHAPTERS.map((chapter) => chapter.title))
  const perAct = new Map<string | null, number>()
  for (const chapter of chapters) perAct.set(chapter.act_title, (perAct.get(chapter.act_title) ?? 0) + 1)
  expect([...perAct]).toEqual([
    ["ACT I — Arrival", 4],
    ["ACT II — The Ledger", 5],
    ["ACT III — The Light", 3],
  ])
  expect(chapters[0].words).toBeGreaterThan(100)
  expect(chapters[4].words).toBe(0)
})

test("story times, links and codex entries", async () => {
  await seedIfEmpty(db)
  const times = await db.getAll<{ title: string; story_time: string }>(
    "SELECT title, story_time FROM chapters WHERE title IN ('The Ferry Home', 'The Night Ferry')",
  )
  expect(Object.fromEntries(times.map((row) => [row.title, parseStoryTime(row.story_time)]))).toEqual({
    "The Ferry Home": { mode: "relative", day: 1, part: "morning" },
    "The Night Ferry": { mode: "relative", label: "12 years earlier", era: "flashback" },
  })

  const links = await db.getAll<{ role: string; n: number; missing: number }>(
    "SELECT role, count(*) AS n, sum(entry_id IS NULL) AS missing FROM entity_links GROUP BY role ORDER BY role",
  )
  const count = (key: "threads" | "present") => SAMPLE_CHAPTERS.reduce((sum, chapter) => sum + chapter[key].length, 0)
  expect(links).toEqual([
    { role: "present", n: count("present"), missing: 0 },
    { role: "thread", n: count("threads"), missing: 0 },
  ])

  expect(await db.get("SELECT count(*) AS n FROM codex_entries")).toEqual({ n: SAMPLE_CODEX.length })
  const untyped = await db.getAll("SELECT name FROM codex_entries WHERE type_id IS NULL")
  expect(untyped).toEqual([])
})

test("plot threads, events and themes aren't tracked as prose mentions", async () => {
  await seedIfEmpty(db)
  const names = (await db.getAll<{ name: string }>(MENTION_ENTRIES_SQL, [await bookId()])).map((row) => row.name)
  expect(names).toContain("Mara Quill")
  expect(names).toContain("the Harbor Guild")
  for (const name of ["Grief", "The Storm", "What we inherit", "Ledger mystery"]) expect(names).not.toContain(name)
})

test("ideas waiting in the Inbox, newest first, one dictated", async () => {
  await seedIfEmpty(db)
  const notes = await db.getAll<{ text: string; source: string; stt_engine: string | null; filed_to: string | null }>(
    `SELECT text, source, stt_engine, filed_to FROM (${INBOX_NOTES_SQL})`,
    [await bookId()],
  )
  expect(notes).toEqual(
    [...SAMPLE_INBOX].reverse().map((note) => ({
      text: note.text,
      source: note.dictated ? "voice-live" : "typed",
      stt_engine: note.dictated ? "on-device" : null,
      filed_to: null,
    })),
  )
})

test("ensureScene gives a chapter without scenes one implicit scene, once", async () => {
  await seedIfEmpty(db)
  const { id } = await db.get<{ id: string }>("SELECT id FROM chapters WHERE title = 'The Archive'")
  await Promise.all([ensureScene(db, id), ensureScene(db, id)])
  expect(await db.getAll(SCENES_SQL, [id])).toEqual([
    { id: expect.any(String), title: "", is_implicit: 1, word_count: 0 },
  ])
})
