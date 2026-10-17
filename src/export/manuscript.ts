import { groupChapters, sortByPosition } from "@/db/order"
import type { Db } from "@/db/tx"
import { countWords } from "@/lib/words"
import { docFromState } from "@/yjs/versions"
import { blocksText, docBlocks, SCENE_BREAK, tidyBlocks, type Block } from "./blocks"
import type { SceneReader } from "./scenes"

/*
 * The book as exports see it (DESIGN.md §13): chapters in reading order, each with its scenes' prose joined by
 * scene breaks. Trashed chapters and scenes stay out, and so do chapters with nothing written yet.
 */

export interface ManuscriptChapter {
  id: string
  /** Counts the book's chapters as the planner does, written or not. Null for a prologue, epilogue and the like. */
  number: number | null
  /** As typed, trimmed: may be empty. */
  title: string
  blocks: Block[]
}

export interface Manuscript {
  title: string
  author: string
  chapters: ManuscriptChapter[]
  /** Words in the scenes, as the editor counts them; chapter headings aside. */
  words: number
}

/** How chapters are headed: "Chapter 3: The Ferry Home", "Chapter 3" or "The Ferry Home". */
export type ChapterHeadings = "number-title" | "number" | "title"

export const CHAPTER_HEADINGS: readonly ChapterHeadings[] = ["number-title", "number", "title"]

/** Chapters headed by their title alone, outside the numbering. */
const UNNUMBERED = /^(prologue|epilogue|interlude|foreword|preface|afterword)\b/i

export async function loadManuscript(db: Db, bookId: string, readScene: SceneReader): Promise<Manuscript> {
  const book = await db.getOptional<{ title: string | null; author: string | null }>(
    "SELECT title, author FROM books WHERE id = ?",
    [bookId],
  )
  if (!book) throw new Error(`There's no book ${bookId}.`)
  const acts = await db.getAll<{ id: string; position: string | null }>(
    "SELECT id, position FROM acts WHERE book_id = ?",
    [bookId],
  )
  const chapterRows = await db.getAll<{ id: string; act_id: string | null; position: string | null; title: string | null }>(
    "SELECT id, act_id, position, title FROM chapters WHERE book_id = ? AND deleted_at IS NULL",
    [bookId],
  )
  const sceneRows = await db.getAll<{ id: string; chapter_id: string; position: string | null }>(
    `SELECT scenes.id, scenes.chapter_id, scenes.position FROM scenes
     JOIN chapters ON chapters.id = scenes.chapter_id
     WHERE chapters.book_id = ? AND scenes.deleted_at IS NULL`,
    [bookId],
  )
  const scenesOf = new Map<string, typeof sceneRows>()
  for (const scene of sceneRows) scenesOf.set(scene.chapter_id, [...(scenesOf.get(scene.chapter_id) ?? []), scene])

  const chapters: ManuscriptChapter[] = []
  let numbered = 0
  let words = 0
  for (const chapter of groupChapters(acts, chapterRows).flatMap((group) => group.chapters)) {
    const title = chapter.title?.trim() ?? ""
    const number = UNNUMBERED.test(title) ? null : ++numbered
    const blocks: Block[] = []
    for (const scene of sortByPosition(scenesOf.get(chapter.id) ?? [])) {
      const doc = docFromState(await readScene(scene.id))
      const prose = tidyBlocks(docBlocks(doc))
      doc.destroy()
      if (prose.length === 0) continue
      if (blocks.length > 0) blocks.push(SCENE_BREAK)
      blocks.push(...prose)
    }
    if (blocks.length === 0) continue
    words += countWords(blocksText(blocks))
    chapters.push({ id: chapter.id, number, title, blocks })
  }
  return { title: book.title?.trim() || "Untitled book", author: book.author?.trim() ?? "", chapters, words }
}

/** A chapter's heading as a manuscript sets it, a line per part: ["Chapter 3", "The Ferry Home"]. */
export function chapterHeadingLines(chapter: Pick<ManuscriptChapter, "number" | "title">, style: ChapterHeadings) {
  const title = chapter.title.trim()
  if (chapter.number === null) return [title]
  const number = `Chapter ${chapter.number}`
  if (!title || style === "number") return [number]
  // "Chapter 3: Chapter Three" would say it twice.
  if (style === "title" || /^chapter\b/i.test(title)) return [title]
  return [number, title]
}

/** A chapter's heading on one line: "Chapter 3: The Ferry Home". */
export const chapterHeading = (chapter: Pick<ManuscriptChapter, "number" | "title">, style: ChapterHeadings) =>
  chapterHeadingLines(chapter, style).join(": ")
