import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { heading, paras, sceneBreak, text } from "@/test/blocks"
import {
  chapterFiles,
  FILE_TYPES,
  manuscriptFile,
  markdownBook,
  NOTHING_TO_EXPORT,
  safeFilename,
  textBook,
  type ManuscriptOptions,
} from "./files"
import type { Manuscript } from "./manuscript"

const manuscript: Manuscript = {
  title: "The Salt Ledger",
  author: "Ann Lee",
  words: 7,
  chapters: [
    { id: "a", number: null, title: "Prologue", blocks: paras("Fog.") },
    {
      id: "b",
      number: 1,
      title: "The Ferry Home",
      blocks: [heading(2, text("Dawn")), ...paras("The ferry docked."), sceneBreak, ...paras("Night.")],
    },
    { id: "c", number: 2, title: "", blocks: paras("Rain.") },
  ],
}

const options = (overrides: Partial<ManuscriptOptions>): ManuscriptOptions => ({
  format: "markdown",
  perChapter: false,
  headings: "number-title",
  font: "times",
  paper: "letter",
  ...overrides,
})

describe("markdownBook and textBook", () => {
  it("set out the whole book in Markdown", () => {
    expect(markdownBook(manuscript, "number-title")).toBe(
      [
        "# The Salt Ledger",
        "by Ann Lee",
        "## Prologue",
        "Fog.",
        "## Chapter 1: The Ferry Home",
        "### Dawn",
        "The ferry docked.",
        "* * *",
        "Night.",
        "## Chapter 2",
        "Rain.\n",
      ].join("\n\n"),
    )
    expect(markdownBook({ ...manuscript, author: "", chapters: [] }, "title")).toBe("# The Salt Ledger\n")
  })

  it("set out the whole book in plain text", () => {
    expect(textBook(manuscript, "number")).toBe(
      [
        "The Salt Ledger\n\nby Ann Lee",
        "Prologue\n\nFog.",
        "Chapter 1\n\nDawn\n\nThe ferry docked.\n\n* * *\n\nNight.",
        "Chapter 2\n\nRain.\n",
      ].join("\n\n\n"),
    )
  })
})

describe("chapterFiles", () => {
  it("gives each chapter a numbered file", () => {
    expect(chapterFiles(manuscript, "title", "md")).toEqual([
      { name: "01 Prologue.md", data: "# Prologue\n\nFog.\n" },
      { name: "02 The Ferry Home.md", data: "# The Ferry Home\n\n## Dawn\n\nThe ferry docked.\n\n* * *\n\nNight.\n" },
      { name: "03 Chapter 2.md", data: "# Chapter 2\n\nRain.\n" },
    ])
    expect(chapterFiles(manuscript, "number-title", "txt").map((file) => file.data)).toEqual([
      "Prologue\n\nFog.\n",
      "Chapter 1: The Ferry Home\n\nDawn\n\nThe ferry docked.\n\n* * *\n\nNight.\n",
      "Chapter 2\n\nRain.\n",
    ])
  })

  it("pads numbers so a hundred chapters still sort", () => {
    const chapters = Array.from({ length: 100 }, (_, index) => ({
      id: `${index}`,
      number: index + 1,
      title: `Part ${index + 1}`,
      blocks: paras("Words."),
    }))
    const names = chapterFiles({ ...manuscript, chapters }, "number", "txt").map((file) => file.name)
    expect([names[0], names[99]]).toEqual(["001 Part 1.txt", "100 Part 100.txt"])
  })
})

describe("manuscriptFile", () => {
  it("makes the format asked for", async () => {
    expect(await manuscriptFile(manuscript, options({ format: "markdown" }))).toEqual({
      name: "The Salt Ledger.md",
      type: FILE_TYPES.markdown,
      data: markdownBook(manuscript, "number-title"),
    })
    expect(await manuscriptFile(manuscript, options({ format: "text", headings: "title" }))).toEqual({
      name: "The Salt Ledger.txt",
      type: FILE_TYPES.text,
      data: textBook(manuscript, "title"),
    })

    const word = await manuscriptFile(manuscript, options({ format: "docx" }))
    expect([word.name, word.type]).toEqual(["The Salt Ledger.docx", FILE_TYPES.docx])
    expect(Object.keys(unzipSync(word.data as Uint8Array))).toContain("word/document.xml")
  })

  it("zips a file per chapter", async () => {
    const file = await manuscriptFile(manuscript, options({ format: "text", perChapter: true }))
    expect([file.name, file.type]).toEqual(["The Salt Ledger (text).zip", FILE_TYPES.zip])
    const files = unzipSync(file.data as Uint8Array)
    expect(Object.keys(files)).toEqual(["01 Prologue.txt", "02 The Ferry Home.txt", "03 Chapter 2.txt"])
    expect(strFromU8(files["01 Prologue.txt"])).toBe("Prologue\n\nFog.\n")

    const markdown = await manuscriptFile(manuscript, options({ format: "markdown", perChapter: true }))
    expect(markdown.name).toBe("The Salt Ledger (Markdown).zip")
  })

  it("names the file after the title, safely", async () => {
    const file = await manuscriptFile({ ...manuscript, title: "Notes: Draft 2/3?" }, options({}))
    expect(file.name).toBe("Notes Draft 2 3.md")
  })

  it("refuses a book with nothing written", async () => {
    await expect(manuscriptFile({ ...manuscript, chapters: [] }, options({}))).rejects.toThrow(NOTHING_TO_EXPORT)
  })
})

describe("safeFilename", () => {
  it("swaps out characters Windows forbids, and control codes", () => {
    expect(safeFilename('The "Salt" Ledger: A/B\\C|D?*<E>', "x")).toBe("The Salt Ledger A B C D E")
    expect(safeFilename("Line\nbreak\ttab\u0000\u007f end", "x")).toBe("Line break tab end")
  })

  it("trims dots and spaces from either end", () => {
    expect(safeFilename("  ...Ledger...  ", "x")).toBe("Ledger")
    expect(safeFilename("Mr. Ledger", "x")).toBe("Mr. Ledger")
  })

  it("steers clear of names Windows reserves", () => {
    expect(safeFilename("CON", "x")).toBe("_CON")
    expect(safeFilename("lpt1.txt", "x")).toBe("_lpt1.txt")
    expect(safeFilename("Con Air", "x")).toBe("Con Air")
  })

  it("keeps names short, by character", () => {
    expect(safeFilename("a".repeat(200), "x")).toHaveLength(120)
    const emoji = safeFilename("🙂".repeat(130), "x")
    expect(Array.from(emoji)).toHaveLength(120)
    expect(emoji).toBe("🙂".repeat(120))
  })

  it("falls back when nothing is left", () => {
    expect(safeFilename(" ... ", "Untitled book")).toBe("Untitled book")
    expect(safeFilename("???", "<>")).toBe("Untitled")
  })
})
