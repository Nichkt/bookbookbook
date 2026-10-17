import { generateKeyBetween } from "fractional-indexing"
import { newId } from "@/lib/id"
import { NO_AUTO_MENTION_TYPES } from "./codexTypes"
import type { ChapterStatus } from "./schema"
import { insertRow, type Db, type Tx } from "./tx"

export interface BookListRow {
  id: string
  title: string | null
  author: string | null
  genre: string | null
  target_words: number | null
  universe_id: string | null
}

export const BOOKS_SQL = `
  SELECT id, title, author, genre, target_words, universe_id FROM books WHERE deleted_at IS NULL ORDER BY created_at, id`

/**
 * `title`, or if another book has it, `title (word)`, `title (word 2)`…: for a book restored or imported beside
 * the one it came from, so the two can be told apart.
 */
export async function unusedTitle(tx: Tx, title: string, word: string): Promise<string> {
  const taken = async (candidate: string) =>
    Boolean(await tx.getOptional("SELECT id FROM books WHERE deleted_at IS NULL AND title = ?", [candidate]))
  if (!(await taken(title))) return title
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${title} (${word})` : `${title} (${word} ${n})`
    if (!(await taken(candidate))) return candidate
  }
}

export interface ActListRow {
  id: string
  title: string | null
  position: string | null
}

export const ACTS_SQL = "SELECT id, title, position FROM acts WHERE book_id = ? ORDER BY position, id"

export interface ChapterListRow {
  id: string
  position: string | null
  title: string | null
  summary: string | null
  status: ChapterStatus | null
  word_target: number | null
  /** null when the chapter is in no act, or its act is gone. */
  act_id: string | null
  act_title: string | null
  words: number
}

/*
 * Reading order: acts by position, then chapters by position within their act (DESIGN.md §5). Chapters whose act is
 * missing come last. Positions are fractional-indexing keys, which sort correctly with SQLite's default (binary)
 * collation. Chapters and scenes in the Trash are left out.
 */
export const CHAPTERS_SQL = `
  SELECT c.id, c.position, c.title, c.summary, c.status, c.word_target, a.id AS act_id, a.title AS act_title,
    (SELECT coalesce(sum(s.word_count), 0) FROM scenes s WHERE s.chapter_id = c.id AND s.deleted_at IS NULL) AS words
  FROM chapters c LEFT JOIN acts a ON a.id = c.act_id
  WHERE c.book_id = ? AND c.deleted_at IS NULL
  ORDER BY a.id IS NULL, a.position, a.id, c.position, c.id`

export interface SceneListRow {
  id: string
  title: string | null
  is_implicit: number | null
  word_count: number | null
}

export const SCENES_SQL = `
  SELECT id, title, is_implicit, word_count FROM scenes
  WHERE chapter_id = ? AND deleted_at IS NULL ORDER BY position, id`

export interface MentionRow {
  id: string
  name: string | null
  aliases: string | null
}

export const MENTION_ENTRIES_SQL = `
  SELECT e.id, e.name, e.aliases
  FROM codex_entries e
    JOIN books b ON b.universe_id = e.universe_id
    LEFT JOIN codex_types t ON t.id = e.type_id
  WHERE b.id = ? AND e.deleted_at IS NULL
    AND coalesce(t.key, '') NOT IN (${NO_AUTO_MENTION_TYPES.map((key) => `'${key}'`).join(", ")})`

/**
 * Scenes are optional (DESIGN.md §5): a chapter without them writes into one implicit scene, created the first
 * time the chapter opens. The check and insert share a transaction, so two tabs can't both create one.
 */
export async function ensureScene(db: Db, chapterId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional(
      "SELECT id FROM scenes WHERE chapter_id = ? AND deleted_at IS NULL LIMIT 1",
      [chapterId],
    )
    if (existing) return
    await insertRow(tx, "scenes", {
      id: newId(),
      chapter_id: chapterId,
      position: generateKeyBetween(null, null),
      title: "",
      summary: "",
      pov_entry_id: null,
      is_implicit: 1,
      story_time: null,
      word_count: 0,
      ai_word_count: 0,
      deleted_at: null,
    })
  })
}