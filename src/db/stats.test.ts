import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { buildBook, sceneRow } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import { DAY_STATS_SQL, localDay, recordWordCount, type DayStatsRow } from "./stats"

let db: ReturnType<typeof createTestDb>

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "One", scenes: [{ title: "A", words: 100 }, { title: "B" }] }] })
})

afterEach(() => db.close())

const day = (date: string, book = "book") => db.get<DayStatsRow>(DAY_STATS_SQL, [book, date])

describe("recordWordCount", () => {
  test("saves the count and adds growth and shrinkage to the day's stats", async () => {
    await recordWordCount(db, "sc-One-1", 130, "phone", "2025-03-01")
    await recordWordCount(db, "sc-One-1", 120, "phone", "2025-03-01")
    await recordWordCount(db, "sc-One-2", 45, "phone", "2025-03-01")
    expect((await sceneRow(db, "sc-One-1")).word_count).toBe(120)
    expect((await sceneRow(db, "sc-One-2")).word_count).toBe(45)
    expect(await day("2025-03-01")).toEqual({ added: 75, removed: 10 })
    expect(await db.getAll("SELECT id FROM writing_stats")).toEqual([{ id: "phone:book:2025-03-01" }])
  })

  test("keeps days and devices apart, and a day's total adds up its devices", async () => {
    await recordWordCount(db, "sc-One-1", 110, "phone", "2025-03-01")
    await recordWordCount(db, "sc-One-1", 150, "laptop", "2025-03-01")
    await recordWordCount(db, "sc-One-1", 140, "laptop", "2025-03-02")
    expect(await day("2025-03-01")).toEqual({ added: 50, removed: 0 })
    expect(await day("2025-03-02")).toEqual({ added: 0, removed: 10 })
    expect(await db.getAll("SELECT id FROM writing_stats ORDER BY id")).toHaveLength(3)
  })

  test("an unchanged count writes nothing, and a missing scene is ignored", async () => {
    await recordWordCount(db, "sc-One-1", 100, "phone", "2025-03-01")
    await recordWordCount(db, "nope", 10, "phone", "2025-03-01")
    expect(await db.getAll("SELECT id FROM writing_stats")).toEqual([])
    expect(await day("2025-03-01")).toEqual({ added: 0, removed: 0 })
  })
})

test("localDay is the local calendar date", () => {
  expect(localDay(new Date(2025, 0, 9, 23, 59))).toBe("2025-01-09")
  expect(localDay(new Date(2025, 11, 31, 0, 0))).toBe("2025-12-31")
})
