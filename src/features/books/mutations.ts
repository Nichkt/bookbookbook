import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing"
import { ChangeSet } from "@/db/changes"
import { insertBuiltinCodexTypes } from "@/db/codexTypes"
import { insertRow, updateRow, type Db, type Tx } from "@/db/tx"
import { DEFAULT_CHAPTER_TARGET, newChapterRow } from "@/features/plan/mutations"
import { canonicalStructureKey, scaffoldStructure, type StoryStructure } from "@/features/plan/structures"
import { newId } from "@/lib/id"

export const DEFAULT_BOOK_TARGET = 80_000

export interface NewBook {
  title: string
  targetWords: number | null
  /** Start from a story structure: its acts, and a chapter per structure moment. */
  structure?: StoryStructure | null
}

/**
 * A new book gets its own universe and the built-in World types. It starts with one blank chapter and no acts (they
 * appear when the writer adds the first one), or from a structure (DESIGN.md §6): its acts, and a chapter per
 * structure moment, titled and marked as it. Returns the first chapter.
 */
export async function createBook(db: Db, input: NewBook): Promise<{ bookId: string; chapterId: string }> {
  return db.writeTransaction(async (tx) => {
    const title = input.title.trim() || "Untitled book"
    const universeId = newId()
    const bookId = newId()
    await insertRow(tx, "universes", { id: universeId, name: title })
    await insertRow(tx, "books", {
      id: bookId,
      universe_id: universeId,
      title,
      genre: "",
      target_words: input.targetWords,
      style_guide: "",
      sample_passages: "[]",
      template_key: input.structure ? canonicalStructureKey(input.structure.key) : null,
      created_at: new Date().toISOString(),
    })
    await insertBuiltinCodexTypes(tx, universeId)
    if (input.structure) return { bookId, chapterId: await insertScaffold(tx, bookId, input) }
    const chapterId = newId()
    await insertRow(
      tx,
      "chapters",
      newChapterRow({ id: chapterId, book_id: bookId, position: generateKeyBetween(null, null) }),
    )
    return { bookId, chapterId }
  })
}

async function insertScaffold(tx: Tx, bookId: string, input: NewBook): Promise<string> {
  const { acts, hasActs } = scaffoldStructure(input.structure!, input.targetWords, DEFAULT_CHAPTER_TARGET)
  const actKeys = generateNKeysBetween(null, null, acts.length)
  const chapterIds: string[] = []
  for (const [index, act] of acts.entries()) {
    const actId = hasActs ? newId() : null
    if (actId) await insertRow(tx, "acts", { id: actId, book_id: bookId, title: act.title, position: actKeys[index] })
    const keys = generateNKeysBetween(null, null, act.chapters.length)
    for (const [place, chapter] of act.chapters.entries()) {
      const id = newId()
      chapterIds.push(id)
      await insertRow(
        tx,
        "chapters",
        newChapterRow({
          id,
          book_id: bookId,
          act_id: actId,
          position: keys[place],
          title: chapter.title,
          word_target: chapter.wordTarget,
          template_beat_key: chapter.beatKey,
        }),
      )
    }
  }
  return chapterIds[0]
}

export interface BookPatch {
  title?: string
  author?: string
  genre?: string
  target_words?: number | null
  template_key?: string | null
  premise?: string
  synopsis?: string
}

const BOOK_FIELDS = ["title", "author", "genre", "target_words", "template_key", "premise", "synopsis"] as const

export async function updateBook(db: Db, id: string, patch: BookPatch) {
  const values: Record<string, string | number | null> = {}
  for (const field of BOOK_FIELDS) {
    const value = patch[field]
    if (value !== undefined) values[field] = value
  }
  await updateRow(db, "books", id, values)
}

/** The story structure the book follows, or none. Its chapters stay marked as the moments they are. */
export async function setBookStructure(db: Db, id: string, key: string | null) {
  await updateBook(db, id, { template_key: key ? canonicalStructureKey(key) : null })
}

export async function trashBook(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "books", [id])
    await updateRow(tx, "books", id, { deleted_at: new Date().toISOString() })
    return changes
  })
}

export async function restoreBook(db: Db, id: string) {
  await updateRow(db, "books", id, { deleted_at: null })
}
