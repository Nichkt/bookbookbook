import { newId } from "@/lib/id"
import { insertRow, type Db, type Tx } from "./tx"

/*
 * Daily writing stats (DESIGN.md §8 "Provenance and stats"). Rows are per device and day, `<device>:<book>:<day>`,
 * so two devices never write the same row once sync lands: a day's total is the sum over its rows.
 */

/** The writer's calendar day, YYYY-MM-DD in local time: goals follow the writer's clock, not UTC. */
export function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const DEVICE_KEY = "bbb.device"
let device: string | undefined

/** A random id for this browser profile, kept in localStorage. */
export function deviceId(): string {
  if (device) return device
  try {
    device = localStorage.getItem(DEVICE_KEY) ?? undefined
    if (!device) {
      device = newId()
      localStorage.setItem(DEVICE_KEY, device)
    }
  } catch {
    device ??= newId()
  }
  return device
}

/**
 * Saves a scene's word count and how many of its words an AI tool wrote, and adds the change in the writer's own
 * words since the last save to the day's stats for its book: growth to `words_added`, shrinkage to `words_removed`.
 * AI text going in counts toward `ai_words_inserted` instead (DESIGN.md §8 "Provenance and stats"). Only edits made
 * here should be recorded, or a change synced in from another tab or device would count twice.
 */
export async function recordWordCount(
  db: Db,
  sceneId: string,
  words: number,
  device: string,
  day: string,
  aiWords = 0,
) {
  await db.writeTransaction(async (tx) => {
    const scene = await tx.getOptional<{
      word_count: number | null
      ai_word_count: number | null
      book_id: string | null
    }>(
      `SELECT s.word_count, s.ai_word_count, c.book_id
       FROM scenes s LEFT JOIN chapters c ON c.id = s.chapter_id WHERE s.id = ?`,
      [sceneId],
    )
    if (!scene) return
    const before = scene.word_count ?? 0
    const aiBefore = scene.ai_word_count ?? 0
    if (words === before && aiWords === aiBefore) return
    await tx.execute("UPDATE scenes SET word_count = ?, ai_word_count = ? WHERE id = ?", [words, aiWords, sceneId])
    if (!scene.book_id) return
    const delta = words - aiWords - (before - aiBefore)
    const inserted = Math.max(aiWords - aiBefore, 0)
    if (delta === 0 && inserted === 0) return
    await addToDay(tx, device, scene.book_id, day, {
      words_added: Math.max(delta, 0),
      words_removed: Math.max(-delta, 0),
      ai_words_inserted: inserted,
    })
  })
}

/** Counts a finished writing sprint in the day's stats for its book. */
export async function recordSprint(db: Db, bookId: string, device: string, day: string) {
  await db.writeTransaction((tx) => addToDay(tx, device, bookId, day, { sprints: 1 }))
}

type DayCounter = "words_added" | "words_removed" | "ai_words_inserted" | "sprints"

/** Adds to this device's row for the book's day, making the row if it's the day's first. */
async function addToDay(
  tx: Tx,
  device: string,
  bookId: string,
  day: string,
  amounts: Partial<Record<DayCounter, number>>,
) {
  const id = `${device}:${bookId}:${day}`
  const counters = Object.entries(amounts)
  if (await tx.getOptional("SELECT id FROM writing_stats WHERE id = ?", [id])) {
    const sets = counters.map(([column]) => `${column} = coalesce(${column}, 0) + ?`).join(", ")
    await tx.execute(`UPDATE writing_stats SET ${sets} WHERE id = ?`, [...counters.map(([, amount]) => amount), id])
  } else {
    await insertRow(tx, "writing_stats", {
      id,
      book_id: bookId,
      date: day,
      words_added: 0,
      words_removed: 0,
      ai_words_inserted: 0,
      dictated_words: 0,
      sprints: 0,
      ...amounts,
    })
  }
}

export interface DayStatsRow {
  added: number
  removed: number
}

/** A book's words added and removed on one day, over every device. */
export const DAY_STATS_SQL = `
  SELECT coalesce(sum(words_added), 0) AS added, coalesce(sum(words_removed), 0) AS removed
  FROM writing_stats WHERE book_id = ? AND date = ?`

export interface DayNetRow {
  date: string
  /** Words added less words removed. */
  net: number
}

/** A book's net words by day, newest first, over every device: what daily goals and streaks count. */
export const DAILY_NET_SQL = `
  SELECT date, coalesce(sum(words_added), 0) - coalesce(sum(words_removed), 0) AS net
  FROM writing_stats WHERE book_id = ? AND date IS NOT NULL GROUP BY date ORDER BY date DESC`

/** A book's net words on one day, over every device: params key, book, day. The row says which key it's for. */
export const DAY_NET_SQL = `
  SELECT ? AS key, coalesce(sum(words_added), 0) - coalesce(sum(words_removed), 0) AS net
  FROM writing_stats WHERE book_id = ? AND date = ?`

/** This device's net words in a book from a day on: params book, day, and `<device>:%`. Sprints count from it. */
export const DEVICE_NET_SINCE_SQL = `
  SELECT coalesce(sum(words_added), 0) - coalesce(sum(words_removed), 0) AS net
  FROM writing_stats WHERE book_id = ? AND date >= ? AND id LIKE ?`
