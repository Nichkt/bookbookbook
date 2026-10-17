import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildBook } from "@/test/book"
import { heading, para, paras, sceneBreak, text, writeProse } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import { chapterHeading, chapterHeadingLines, loadManuscript } from "./manuscript"
import { storedSceneReader } from "./scenes"

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const load = (bookId = "book") => loadManuscript(db, bookId, storedSceneReader(db))

describe("loadManuscript", () => {
  it("joins each chapter's scenes in reading order, with breaks between", async () => {
    await buildBook(db, {
      acts: [
        { title: "I", chapters: [{ title: "Arrival", scenes: [{ title: "a" }, { title: "b" }, { title: "c" }] }] },
        { title: "II", chapters: [{ title: "Storm", scenes: [{ title: "a" }] }] },
      ],
    })
    await writeProse(db, "sc-Arrival-1", paras("The ferry docked.", "Mara stepped off."))
    // Pristine and blank scenes add nothing, not even a break.
    await writeProse(db, "sc-Arrival-2", [para(), para(text("  "))])
    await writeProse(db, "sc-Arrival-3", [sceneBreak, ...paras("Night fell."), sceneBreak])
    await writeProse(db, "sc-Storm-1", [heading(2, text("Later")), ...paras("Rain.")])
    await db.execute("UPDATE books SET title = ?, author = ? WHERE id = 'book'", ["  The Salt Ledger ", " Ann Lee "])

    const manuscript = await load()
    expect(manuscript).toMatchObject({ title: "The Salt Ledger", author: "Ann Lee", words: 10 })
    expect(manuscript.chapters).toEqual([
      {
        id: "ch-Arrival",
        number: 1,
        title: "Arrival",
        blocks: [...paras("The ferry docked.", "Mara stepped off."), sceneBreak, ...paras("Night fell.")],
      },
      { id: "ch-Storm", number: 2, title: "Storm", blocks: [heading(2, text("Later")), ...paras("Rain.")] },
    ])
  })

  it("leaves out the Trash and unwritten chapters, which still count", async () => {
    await buildBook(db, {
      chapters: [
        { title: "One", scenes: [{ title: "a" }, { title: "gone", deleted: true }] },
        { title: "Two", scenes: [{ title: "a" }] },
        { title: "Binned", deleted: true, scenes: [{ title: "a" }] },
        { title: "Three", scenes: [{ title: "a" }] },
      ],
    })
    await writeProse(db, "sc-One-1", paras("Kept."))
    await writeProse(db, "sc-One-2", paras("Trashed scene."))
    await writeProse(db, "sc-Binned-1", paras("Trashed chapter."))
    await writeProse(db, "sc-Three-1", paras("Third."))

    const manuscript = await load()
    expect(manuscript.chapters.map((chapter) => [chapter.number, chapter.title])).toEqual([
      [1, "One"],
      [3, "Three"],
    ])
    expect(manuscript.chapters[0].blocks).toEqual(paras("Kept."))
    expect(manuscript.words).toBe(2)
  })

  it("keeps a prologue and epilogue out of the numbering", async () => {
    await buildBook(db, {
      chapters: ["Prologue: The Wreck", "Landfall", "Epilogue", "Prologues Are Dull", "Interlude", "Departure"].map(
        (title) => ({ title, scenes: [{}] }),
      ),
    })
    for (const title of ["Prologue: The Wreck", "Landfall", "Epilogue", "Prologues Are Dull", "Interlude", "Departure"]) {
      await writeProse(db, `sc-${title}-1`, paras("Words."))
    }
    const manuscript = await load()
    expect(manuscript.chapters.map((chapter) => chapter.number)).toEqual([null, 1, null, 2, null, 3])
  })

  it("falls back to a title, and fails for a missing book", async () => {
    await buildBook(db, { chapters: [] })
    await db.execute("UPDATE books SET title = '  ' WHERE id = 'book'")
    expect(await load()).toEqual({ title: "Untitled book", author: "", chapters: [], words: 0 })
    await expect(load("nope")).rejects.toThrow()
  })
})

describe("chapterHeadingLines", () => {
  const chapter = (number: number | null, title: string) => ({ number, title })

  it("heads chapters in each style", () => {
    expect(chapterHeadingLines(chapter(3, "The Ferry Home"), "number-title")).toEqual(["Chapter 3", "The Ferry Home"])
    expect(chapterHeadingLines(chapter(3, "The Ferry Home"), "number")).toEqual(["Chapter 3"])
    expect(chapterHeadingLines(chapter(3, "The Ferry Home"), "title")).toEqual(["The Ferry Home"])
    expect(chapterHeading(chapter(3, "The Ferry Home"), "number-title")).toBe("Chapter 3: The Ferry Home")
  })

  it("numbers an untitled chapter in any style", () => {
    for (const style of ["number-title", "number", "title"] as const) {
      expect(chapterHeadingLines(chapter(4, " "), style)).toEqual(["Chapter 4"])
    }
  })

  it("doesn't say Chapter twice, or number a prologue", () => {
    expect(chapterHeading(chapter(2, "Chapter Two"), "number-title")).toBe("Chapter Two")
    expect(chapterHeading(chapter(2, "Chapters of Salt"), "number-title")).toBe("Chapter 2: Chapters of Salt")
    expect(chapterHeading(chapter(null, "Prologue"), "number")).toBe("Prologue")
  })
})
