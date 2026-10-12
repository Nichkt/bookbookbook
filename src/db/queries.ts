import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { generateKeyBetween } from "fractional-indexing"
import { newId } from "@/lib/id"
import type { ChapterStatus } from "./schema"

export interface BookListRow {
  id: string
  title: string | null
}

export const BOOKS_SQL = "SELECT id, title FROM books WHERE deleted_at IS NULL ORDER BY created_at, id"

export interface ChapterListRow {
  id: string
  title: string | null
  summary: string | null
  status: ChapterStatus | null
  word_target: number | null
  words: number
}

// Positions are fractional-indexing keys, which sort correctly with SQLite's default (binary) collation.
export const CHAPTERS_SQL = `
  SELECT c.id, c.title, c.summary, c.status, c.word_target,
    (SELECT coalesce(sum(s.word_count), 0) FROM scenes s WHERE s.chapter_id = c.id) AS words
  FROM chapters c
  WHERE c.book_id = ?
  ORDER BY c.position, c.id`

export interface SceneListRow {
  id: string
  title: string | null
  is_implicit: number | null
  word_count: number | null
}

export const SCENES_SQL = `
  SELECT id, title, is_implicit, word_count FROM scenes WHERE chapter_id = ? ORDER BY position, id`

export interface MentionRow {
  id: string
  name: string | null
  aliases: string | null
}

export const MENTION_ENTRIES_SQL = `
  SELECT e.id, e.name, e.aliases
  FROM codex_entries e JOIN books b ON b.universe_id = e.universe_id
  WHERE b.id = ?`

/**
 * Scenes are optional (DESIGN.md §5): a chapter without them writes into one implicit scene, created the first
 * time the chapter opens. The check and insert share a transaction, so two tabs can't both create one.
 */
export async function ensureScene(db: AbstractPowerSyncDatabase, chapterId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional("SELECT id FROM scenes WHERE chapter_id = ? LIMIT 1", [chapterId])
    if (existing) return
    await tx.execute(
      `INSERT INTO scenes (id, chapter_id, position, title, summary, is_implicit, word_count, ai_word_count)
       VALUES (?, ?, ?, '', '', 1, 0, 0)`,
      [newId(), chapterId, generateKeyBetween(null, null)],
    )
  })
}
