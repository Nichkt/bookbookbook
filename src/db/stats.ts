import { newId } from "@/lib/id"
import { insertRow, type Db } from "./tx"

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
 * Saves a scene's word count, and adds the change since the last save to the day's stats for its book: growth to
 * `words_added`, shrinkage to `words_removed`. Only edits made here should be recorded, or a change synced in from
 * another tab or device would count twice.
 */
export async function recordWordCount(db: Db, sceneId: string, words: number, device: string, day: string) {
  await db.writeTransaction(async (tx) => {
    const scene = await tx.getOptional<{ word_count: number | null; book_id: string | null }>(
      "SELECT s.word_count, c.book_id FROM scenes s LEFT JOIN chapters c ON c.id = s.chapter_id WHERE s.id = ?",
      [sceneId],
    )
    if (!scene) return
    const delta = words - (scene.word_count ?? 0)
    if (delta === 0) return
    await tx.execute("UPDATE scenes SET word_count = ? WHERE id = ?", [words, sceneId])
    if (!scene.book_id) return

    const id = `${device}:${scene.book_id}:${day}`
    const added = Math.max(delta, 0)
    const removed = Math.max(-delta, 0)
    if (await tx.getOptional("SELECT id FROM writing_stats WHERE id = ?", [id])) {
      await tx.execute(
        `UPDATE writing_stats
         SET words_added = coalesce(words_added, 0) + ?, words_removed = coalesce(words_removed, 0) + ?
         WHERE id = ?`,
        [added, removed, id],
      )
    } else {
      await insertRow(tx, "writing_stats", {
        id,
        book_id: scene.book_id,
        date: day,
        words_added: added,
        words_removed: removed,
        ai_words_inserted: 0,
        dictated_words: 0,
        sprints: 0,
      })
    }
  })
}

export interface DayStatsRow {
  added: number
  removed: number
}

/** A book's words added and removed on one day, over every device. */
export const DAY_STATS_SQL = `
  SELECT coalesce(sum(words_added), 0) AS added, coalesce(sum(words_removed), 0) AS removed
  FROM writing_stats WHERE book_id = ? AND date = ?`
