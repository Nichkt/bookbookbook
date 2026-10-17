import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CODEX_TYPES } from "@/db/codexTypes"
import { blocksText, docBlocks, SCENE_BREAK, tidyBlocks, type Block } from "@/export/blocks"
import { loadManuscript } from "@/export/manuscript"
import { storedSceneReader } from "@/export/scenes"
import { trashBook } from "@/features/books/mutations"
import { countWords } from "@/lib/words"
import { br, heading, list, para, paras, quote, sceneBreak, text } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import { base64ToBytes } from "@/yjs/base64"
import { proseText } from "@/yjs/prose"
import { docFromState } from "@/yjs/versions"
import { ALL_LEFT_OUT, ImportError } from "./errors"
import type { DraftChapter, DraftScene, Outline } from "./outline"
import { importBook, importTarget } from "./write"

let db: ReturnType<typeof createTestDb>
const NOW = new Date(Date.UTC(2025, 2, 1, 12))

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const scene = (title: string, ...blocks: Block[]): DraftScene => ({ title, blocks, words: countWords(blocksText(blocks)) })
const chapter = (key: string, title: string, scenes: DraftScene[], options: Partial<DraftChapter> = {}): DraftChapter => ({
  key,
  title,
  scenes,
  act: null,
  leftOut: false,
  ...options,
})

const DOCK = paras("Mara stepped off.", "The rain had stopped.")
const INN = [para(text("A "), text("warm", "italic"), text(" room.")), { ...para(text("Later.")), center: true }]
const NIGHT = [...paras("She slept."), sceneBreak, ...paras("Morning came.")]

/** Front matter left out, two acts, scenes titled and not, and a chapter with nothing in it. */
const OUTLINE: Outline = [
  chapter("front", "", [scene("", ...paras("Copyright 2025."))], { leftOut: true, act: "Part One" }),
  chapter("c1", "The Ferry", [scene("Dock", ...DOCK), scene("Inn", ...INN)]),
  chapter("c2", " Night ", [scene("", ...NIGHT)]),
  chapter("c3", "Empty", [], { act: " Part Two " }),
  chapter("c4", "Notes", [scene("Plan"), scene("", ...paras("Words."))]),
]

const importOutline = (outline: Outline = OUTLINE, title = "The Ferry Book", author = "Ann Lee") =>
  importBook(db, { title, author, outline }, NOW)

function blocksOf(stateB64: string): { blocks: Block[]; words: number } {
  const doc = docFromState(base64ToBytes(stateB64))
  try {
    return { blocks: tidyBlocks(docBlocks(doc)), words: countWords(proseText(doc)) }
  } finally {
    doc.destroy()
  }
}

describe("importBook", () => {
  it("makes a new book with its own universe and codex types", async () => {
    const { bookId, title } = await importOutline()
    expect(title).toBe("The Ferry Book")
    const book = await db.get<Record<string, string | number | null>>("SELECT * FROM books WHERE id = ?", [bookId])
    expect(book).toMatchObject({
      title: "The Ferry Book",
      author: "Ann Lee",
      genre: "",
      target_words: 80_000,
      created_at: NOW.toISOString(),
    })
    expect(book.deleted_at).toBeNull()
    const universe = await db.get<{ name: string }>("SELECT name FROM universes WHERE id = ?", [book.universe_id])
    expect(universe.name).toBe("The Ferry Book")
    const types = await db.getAll("SELECT id FROM codex_types WHERE universe_id = ?", [book.universe_id])
    expect(types).toHaveLength(CODEX_TYPES.length)
    // Imported words aren't the day's writing.
    expect(await db.getAll("SELECT id FROM writing_stats")).toEqual([])
  })

  it("writes the acts, chapters and scenes in order, as the preview left them", async () => {
    const { bookId, chapterId } = await importOutline()
    const acts = await db.getAll<{ title: string }>("SELECT title FROM acts WHERE book_id = ? ORDER BY position", [bookId])
    expect(acts.map((act) => act.title)).toEqual(["Part One", "Part Two"])

    const chapters = await db.getAll<{ id: string; title: string; status: string; act: string }>(
      `SELECT c.id, c.title, c.status, c.word_target, a.title AS act FROM chapters c JOIN acts a ON a.id = c.act_id
       WHERE c.book_id = ? ORDER BY a.position, c.position`,
      [bookId],
    )
    expect(chapters).toEqual([
      { id: chapterId, title: "The Ferry", status: "drafting", word_target: 3000, act: "Part One" },
      { id: expect.any(String), title: "Night", status: "drafting", word_target: 3000, act: "Part One" },
      { id: expect.any(String), title: "Empty", status: "idea", word_target: 3000, act: "Part Two" },
      { id: expect.any(String), title: "Notes", status: "drafting", word_target: 3000, act: "Part Two" },
    ])

    const scenes = await db.getAll<Record<string, unknown>>(
      `SELECT c.title AS chapter, s.title, s.is_implicit, s.word_count, s.ai_word_count, s.deleted_at
       FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ? ORDER BY c.position, s.position`,
      [bookId],
    )
    const common = { ai_word_count: 0, deleted_at: null }
    expect(scenes).toEqual([
      { chapter: "The Ferry", title: "Dock", is_implicit: 0, word_count: 7, ...common },
      { chapter: "The Ferry", title: "Inn", is_implicit: 0, word_count: 4, ...common },
      { chapter: "Night", title: "", is_implicit: 1, word_count: 4, ...common },
      { chapter: "Notes", title: "Plan", is_implicit: 0, word_count: 0, ...common },
      { chapter: "Notes", title: "", is_implicit: 0, word_count: 1, ...common },
    ])
  })

  it("stores each written scene's prose as its first compaction, counted as the editor counts it", async () => {
    const { bookId } = await importOutline()
    const snapshots = await db.getAll<Record<string, string | number>>(
      `SELECT s.title, s.word_count AS scene_words, p.word_count, p.kind, p.created_at, p.state_b64
       FROM snapshots p JOIN scenes s ON s.id = p.scene_id JOIN chapters c ON c.id = s.chapter_id
       WHERE c.book_id = ? ORDER BY c.position, s.position`,
      [bookId],
    )
    expect(snapshots.map((snapshot) => snapshot.title)).toEqual(["Dock", "Inn", "", ""])
    for (const snapshot of snapshots) {
      expect(snapshot).toMatchObject({ kind: "compaction", created_at: NOW.toISOString() })
      const { words } = blocksOf(String(snapshot.state_b64))
      expect(snapshot.word_count).toBe(words)
      expect(snapshot.scene_words).toBe(words)
    }
    expect(snapshots.map((snapshot) => blocksOf(String(snapshot.state_b64)).blocks)).toEqual([
      DOCK,
      INN,
      NIGHT,
      paras("Words."),
    ])
  })

  it("reads back as the manuscript it came from", async () => {
    const { bookId } = await importOutline()
    const manuscript = await loadManuscript(db, bookId, storedSceneReader(db))
    expect(manuscript).toMatchObject({ title: "The Ferry Book", author: "Ann Lee", words: 16 })
    expect(manuscript.chapters.map(({ title, blocks }) => ({ title, blocks }))).toEqual([
      { title: "The Ferry", blocks: [...DOCK, SCENE_BREAK, ...INN] },
      { title: "Night", blocks: NIGHT },
      { title: "Notes", blocks: paras("Words.") },
    ])
  })

  it("counts words in lists, quotes and line breaks as the editor does", async () => {
    const blocks = [
      heading(3, text("One")),
      para(text("two"), br, text("three")),
      quote(...paras("four five")),
      list(false, [paras("six"), paras("seven eight")]),
    ]
    const { bookId } = await importOutline([chapter("a", "A", [scene("", ...blocks)])])
    const row = await db.get<{ word_count: number; state_b64: string }>(
      `SELECT s.word_count, p.state_b64 FROM scenes s JOIN snapshots p ON p.scene_id = s.id
       JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ?`,
      [bookId],
    )
    expect(row.word_count).toBe(8)
    expect(blocksOf(row.state_b64)).toEqual({ blocks, words: 8 })
  })

  it("makes no acts for a book without them", async () => {
    const { bookId } = await importOutline([chapter("a", "A", [scene("", ...paras("One."))]), chapter("b", "B", [])])
    expect(await db.getAll("SELECT id FROM acts WHERE book_id = ?", [bookId])).toEqual([])
    const chapters = await db.getAll<{ title: string; act_id: string | null }>(
      "SELECT title, act_id FROM chapters WHERE book_id = ? ORDER BY position",
      [bookId],
    )
    expect(chapters).toEqual([
      { title: "A", act_id: null },
      { title: "B", act_id: null },
    ])
  })

  it("names the book apart from one that has its title, and fills in what's blank", async () => {
    const outline = [chapter("a", "A", [scene("", ...paras("One."))])]
    expect((await importOutline(outline, " Same ")).title).toBe("Same")
    expect((await importOutline(outline, "Same")).title).toBe("Same (imported)")
    expect((await importOutline(outline, "Same")).title).toBe("Same (imported 2)")

    const { bookId, title } = await importOutline(outline, "  ", " ")
    expect(title).toBe("Untitled book")
    expect(await db.get("SELECT author FROM books WHERE id = ?", [bookId])).toEqual({ author: null })

    // A book in the Trash doesn't keep its title.
    await trashBook(db, bookId)
    expect((await importOutline(outline, "Untitled book")).title).toBe("Untitled book")
  })

  it("won't make a book of nothing", async () => {
    const leftOut = [chapter("a", "A", [scene("", ...paras("One."))], { leftOut: true })]
    for (const outline of [leftOut, []]) {
      const failure = importOutline(outline)
      await expect(failure).rejects.toBeInstanceOf(ImportError)
      await expect(failure).rejects.toThrow(ALL_LEFT_OUT)
    }
    expect(await db.getAll("SELECT id FROM books")).toEqual([])
    expect(await db.getAll("SELECT id FROM universes")).toEqual([])
  })
})

describe("importTarget", () => {
  it("is the usual target, or the words rounded up to the next 10,000", () => {
    expect(importTarget(0)).toBe(80_000)
    expect(importTarget(80_000)).toBe(80_000)
    expect(importTarget(80_001)).toBe(90_000)
    expect(importTarget(91_250)).toBe(100_000)
    expect(importTarget(120_000)).toBe(120_000)
  })
})
