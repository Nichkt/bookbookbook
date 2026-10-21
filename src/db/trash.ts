import { skipHistory } from "@/undo/recorder"
import type { Db, Tx } from "./tx"

/** Days an item stays in the Trash before it's deleted for good (DESIGN.md §12). */
export const TRASH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days left before `deletedAt` expires, never negative. */
export function daysLeft(deletedAt: string, now = Date.now()): number {
  const expires = Date.parse(deletedAt) + TRASH_DAYS * DAY_MS
  return Number.isNaN(expires) ? TRASH_DAYS : Math.max(0, Math.ceil((expires - now) / DAY_MS))
}

export interface TrashedChapterRow {
  id: string
  title: string | null
  deleted_at: string
}

export interface TrashedSceneRow {
  id: string
  title: string | null
  deleted_at: string
  chapter_title: string | null
  chapter_deleted: number
}

export interface TrashedBookRow {
  id: string
  title: string | null
  deleted_at: string
}

export interface TrashedEntryRow {
  id: string
  name: string | null
  deleted_at: string
  /** Null when the entry has no type. */
  type_name: string | null
  type_key: string | null
  type_builtin: number | null
}

export const TRASHED_CHAPTERS_SQL = `
  SELECT id, title, deleted_at FROM chapters
  WHERE book_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id`

export const TRASHED_SCENES_SQL = `
  SELECT s.id, s.title, s.deleted_at, c.title AS chapter_title, c.deleted_at IS NOT NULL AS chapter_deleted
  FROM scenes s JOIN chapters c ON c.id = s.chapter_id
  WHERE c.book_id = ? AND s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC, s.id`

export const TRASHED_BOOKS_SQL = `
  SELECT id, title, deleted_at FROM books WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id`

/** Codex entries in the Trash, from the book's universe. */
export const TRASHED_ENTRIES_SQL = `
  SELECT e.id, e.name, e.deleted_at, t.name AS type_name, t.key AS type_key, t.builtin AS type_builtin
  FROM codex_entries e
    JOIN books b ON b.universe_id = e.universe_id
    LEFT JOIN codex_types t ON t.id = e.type_id
  WHERE b.id = ? AND e.deleted_at IS NOT NULL ORDER BY e.deleted_at DESC, e.id`

const IN_LIST = "IN (SELECT value FROM json_each(?))"

/** Deletes scenes and everything that hangs off them. */
export async function purgeScenes(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return
  const list = [JSON.stringify(ids)]
  for (const table of ["scene_updates", "snapshots", "comments", "entity_links", "ai_cards", "mention_index", "search_index"]) {
    await tx.execute(`DELETE FROM ${table} WHERE scene_id ${IN_LIST}`, list)
  }
  await tx.execute(`DELETE FROM beats WHERE parent_kind = 'scene' AND parent_id ${IN_LIST}`, list)
  await tx.execute(`DELETE FROM scenes WHERE id ${IN_LIST}`, list)
}

/** Deletes chapters with all their scenes, beats and links. */
export async function purgeChapters(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return
  const list = [JSON.stringify(ids)]
  const scenes = await tx.getAll<{ id: string }>(`SELECT id FROM scenes WHERE chapter_id ${IN_LIST}`, list)
  await purgeScenes(
    tx,
    scenes.map((scene) => scene.id),
  )
  await tx.execute(`DELETE FROM beats WHERE parent_kind = 'chapter' AND parent_id ${IN_LIST}`, list)
  await tx.execute(`DELETE FROM entity_links WHERE chapter_id ${IN_LIST}`, list)
  await tx.execute(`DELETE FROM chapters WHERE id ${IN_LIST}`, list)
}

/** Deletes codex entries, their links, and the plan's references to them. */
export async function purgeEntries(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return
  const list = [JSON.stringify(ids)]
  await tx.execute(`DELETE FROM mention_index WHERE entry_id ${IN_LIST}`, list)
  await tx.execute(`DELETE FROM entity_links WHERE entry_id ${IN_LIST}`, list)
  await tx.execute(`UPDATE chapters SET pov_entry_id = NULL WHERE pov_entry_id ${IN_LIST}`, list)
  await tx.execute(`UPDATE chapters SET location_entry_id = NULL WHERE location_entry_id ${IN_LIST}`, list)
  await tx.execute(`UPDATE scenes SET pov_entry_id = NULL WHERE pov_entry_id ${IN_LIST}`, list)
  await tx.execute(`DELETE FROM codex_entries WHERE id ${IN_LIST}`, list)
}

/** Deletes a book and everything in it, and its universe and codex if no other book shares them. */
export async function purgeBook(tx: Tx, id: string) {
  const book = await tx.getOptional<{ universe_id: string | null }>("SELECT universe_id FROM books WHERE id = ?", [id])
  if (!book) return
  const chapters = await tx.getAll<{ id: string }>("SELECT id FROM chapters WHERE book_id = ?", [id])
  await purgeChapters(
    tx,
    chapters.map((chapter) => chapter.id),
  )
  for (const table of ["acts", "entity_links", "inbox_notes", "ai_cards", "writing_stats", "search_index"]) {
    await tx.execute(`DELETE FROM ${table} WHERE book_id = ?`, [id])
  }
  // Per-book view settings, keyed like `plan.view:<bookId>`.
  await tx.execute("DELETE FROM ui_prefs WHERE instr(id, ?) > 0", [`:${id}`])
  await tx.execute("DELETE FROM books WHERE id = ?", [id])

  const universeId = book.universe_id
  if (!universeId) return
  const shared = await tx.getOptional("SELECT id FROM books WHERE universe_id = ? LIMIT 1", [universeId])
  if (shared) return
  const entries = "(SELECT id FROM codex_entries WHERE universe_id = ?)"
  await tx.execute(`DELETE FROM mention_index WHERE entry_id IN ${entries}`, [universeId])
  await tx.execute(`DELETE FROM entity_links WHERE entry_id IN ${entries}`, [universeId])
  await tx.execute("DELETE FROM codex_entries WHERE universe_id = ?", [universeId])
  await tx.execute("DELETE FROM codex_types WHERE universe_id = ?", [universeId])
  await tx.execute("DELETE FROM universes WHERE id = ?", [universeId])
}

/** Deletes for good whatever has been in the Trash for longer than TRASH_DAYS. Runs at startup. */
export async function purgeExpiredTrash(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS).toISOString()
  await db.writeTransaction(async (tx) => {
    skipHistory(tx)
    const expired = async (table: string) =>
      (
        await tx.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ?`, [
          cutoff,
        ])
      ).map((row) => row.id)
    for (const id of await expired("books")) await purgeBook(tx, id)
    await purgeChapters(tx, await expired("chapters"))
    await purgeScenes(tx, await expired("scenes"))
    await purgeEntries(tx, await expired("codex_entries"))
  })
}

/**
 * Deletes for good everything in the Trash that the Trash dialog lists: this book's chapters and scenes, its
 * universe's codex entries, and books.
 */
export async function emptyTrash(db: Db, bookId: string) {
  await db.writeTransaction(async (tx) => {
    // Deleted for good: Undo can't bring back what went with it, like the text.
    skipHistory(tx)
    const ids = async (sql: string, parameters: string[] = []) =>
      (await tx.getAll<{ id: string }>(sql, parameters)).map((row) => row.id)
    await purgeScenes(
      tx,
      await ids(
        `SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id
         WHERE c.book_id = ? AND s.deleted_at IS NOT NULL`,
        [bookId],
      ),
    )
    await purgeChapters(tx, await ids("SELECT id FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL", [bookId]))
    await purgeEntries(
      tx,
      await ids(
        `SELECT e.id FROM codex_entries e JOIN books b ON b.universe_id = e.universe_id
         WHERE b.id = ? AND e.deleted_at IS NOT NULL`,
        [bookId],
      ),
    )
    for (const id of await ids("SELECT id FROM books WHERE deleted_at IS NOT NULL")) await purgeBook(tx, id)
  })
}

export type TrashKind = "book" | "chapter" | "scene" | "entry"

/** Deletes one Trash item for good. */
export async function purgeItem(db: Db, kind: TrashKind, id: string) {
  await db.writeTransaction(async (tx) => {
    skipHistory(tx)
    if (kind === "book") await purgeBook(tx, id)
    else if (kind === "chapter") await purgeChapters(tx, [id])
    else if (kind === "entry") await purgeEntries(tx, [id])
    else await purgeScenes(tx, [id])
  })
}
