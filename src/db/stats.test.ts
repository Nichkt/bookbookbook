import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { buildBook, sceneRow } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  DAILY_NET_SQL,
  DAY_NET_SQL,
  DAY_STATS_SQL,
  DEVICE_NET_SINCE_SQL,
  localDay,
  recordSprint,
  recordWordCount,
  type DayStatsRow,
} from "./stats"

let db: ReturnType<typeof createTestDb>

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "One", scenes: [{ title: "A", words: 100 }, { title: "B" }] }] })
})

afterEach(() => db.close())

const day = (date: string, book = "book") => db.get<DayStatsRow>(DAY_STATS_SQL, [book, date])
const aiDay = (date: string) =>
  db.get<{ words_added: number; words_removed: number; ai_words_inserted: number }>(
    "SELECT words_added, words_removed, ai_words_inserted FROM writing_stats WHERE id = ?",
    [`phone:book:${date}`],
  )

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

  test("counts AI inserts and writer edits to AI text separately", async () => {
    await recordWordCount(db, "sc-One-1", 120, "phone", "2025-03-01", 20)
    expect(await sceneRow(db, "sc-One-1")).toMatchObject({ word_count: 120, ai_word_count: 20 })
    expect(await aiDay("2025-03-01")).toEqual({
      words_added: 0,
      words_removed: 0,
      ai_words_inserted: 20,
    })

    await recordWordCount(db, "sc-One-1", 120, "phone", "2025-03-01", 5)
    expect(await aiDay("2025-03-01")).toEqual({
      words_added: 15,
      words_removed: 0,
      ai_words_inserted: 20,
    })

    await recordWordCount(db, "sc-One-1", 115, "phone", "2025-03-01", 0)
    expect(await aiDay("2025-03-01")).toEqual({
      words_added: 15,
      words_removed: 0,
      ai_words_inserted: 20,
    })
    await recordWordCount(db, "sc-One-1", 105, "phone", "2025-03-01", 0)
    await recordWordCount(db, "sc-One-1", 105, "phone", "2025-03-01", 0)
    expect(await aiDay("2025-03-01")).toEqual({
      words_added: 15,
      words_removed: 10,
      ai_words_inserted: 20,
    })
  })
})

test("localDay is the local calendar date", () => {
  expect(localDay(new Date(2025, 0, 9, 23, 59))).toBe("2025-01-09")
  expect(localDay(new Date(2025, 11, 31, 0, 0))).toBe("2025-12-31")
})

describe("recordSprint", () => {
  test("counts a sprint in the device's day, with or without words that day", async () => {
    await recordSprint(db, "book", "phone", "2025-03-01")
    await recordWordCount(db, "sc-One-1", 130, "phone", "2025-03-01")
    await recordSprint(db, "book", "phone", "2025-03-01")
    await recordSprint(db, "book", "laptop", "2025-03-01")
    expect(await db.getAll("SELECT id, sprints, words_added FROM writing_stats ORDER BY id")).toEqual([
      { id: "laptop:book:2025-03-01", sprints: 1, words_added: 0 },
      { id: "phone:book:2025-03-01", sprints: 2, words_added: 30 },
    ])
  })
})

describe("goal and sprint queries", () => {
  beforeEach(async () => {
    await recordWordCount(db, "sc-One-1", 160, "phone", "2025-03-01")
    await recordWordCount(db, "sc-One-1", 150, "laptop", "2025-03-01")
    await recordWordCount(db, "sc-One-1", 175, "phone", "2025-03-03")
  })

  test("DAILY_NET_SQL adds up each day's devices, newest first", async () => {
    expect(await db.getAll(DAILY_NET_SQL, ["book"])).toEqual([
      { date: "2025-03-03", net: 25 },
      { date: "2025-03-01", net: 50 },
    ])
  })

  test("DAY_NET_SQL is one day's net words, labelled with the key it was asked for", async () => {
    expect(await db.get(DAY_NET_SQL, ["k", "book", "2025-03-01"])).toEqual({ key: "k", net: 50 })
    expect(await db.get(DAY_NET_SQL, ["k2", "book", "2025-03-02"])).toEqual({ key: "k2", net: 0 })
  })

  test("DEVICE_NET_SINCE_SQL is one device's net words from a day on", async () => {
    expect(await db.get(DEVICE_NET_SINCE_SQL, ["book", "2025-03-01", "phone:%"])).toEqual({ net: 85 })
    expect(await db.get(DEVICE_NET_SINCE_SQL, ["book", "2025-03-02", "phone:%"])).toEqual({ net: 25 })
    expect(await db.get(DEVICE_NET_SINCE_SQL, ["book", "2025-03-02", "laptop:%"])).toEqual({ net: 0 })
  })
})
