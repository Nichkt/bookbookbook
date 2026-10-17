import { describe, expect, it } from "vitest"
import { blocksText, inlineText, type Block } from "@/export/blocks"
import { manuscriptDocx } from "@/export/docx"
import { markdownBook, textBook } from "@/export/files"
import type { Manuscript } from "@/export/manuscript"
import { br, para, paras, sceneBreak, text } from "@/test/blocks"
import { readDocx } from "./docx"
import { readMarkdown } from "./markdown"
import type { DraftChapter } from "./outline"
import { BREAK_PIECE, type Piece } from "./pieces"
import { readSource } from "./read"
import { analyzeManuscript, modeKey, numberValue, splitManuscript, suggestDetails, type SplitSettings } from "./split"
import { readPlainText } from "./text"

const h = (level: number, ...lines: string[]): Piece => ({
  type: "heading",
  level,
  inlines: lines.flatMap((line, index) => (index > 0 ? [br, text(line)] : [text(line)])),
})
const p = (value: string): Piece => ({ type: "block", block: para(text(value)) })
const centred = (value: string): Piece => ({ type: "block", block: { type: "paragraph", inlines: [text(value)], center: true } })
const textPieces = (...lines: string[]) => readPlainText(lines.join("\n\n"), "blank-lines")

const show = (block: Block) =>
  block.type === "break" ? "***" : block.type === "heading" ? `h${block.level}:${inlineText(block.inlines)}` : blocksText([block])

/** A chapter in brief: its title, act and whether it's left out, then a line a scene. */
const summary = (chapter: DraftChapter) => [
  [chapter.title || "(untitled)", chapter.act === null ? "" : `act ${chapter.act || "(untitled)"}`, chapter.leftOut ? "left out" : ""]
    .filter(Boolean)
    .join(" · "),
  ...chapter.scenes.map((scene) => `${scene.title ? `${scene.title}: ` : ""}${scene.blocks.map(show).join(" / ")}`),
]

/** The outline split the likeliest way, or with the settings changed. */
function outlineOf(pieces: readonly Piece[], settings: Partial<SplitSettings> = {}) {
  const analysis = analyzeManuscript(pieces)
  return splitManuscript(pieces, analysis.titleIndex, { ...analysis.settings, ...settings }).map(summary)
}

const details = (pieces: readonly Piece[]) => {
  const analysis = analyzeManuscript(pieces)
  return suggestDetails(pieces, analysis, analysis.settings)
}

const PARTS = [
  h(1, "Part One: Arrival"),
  h(2, "Chapter 1: The Ferry"),
  p("Text one."),
  h(3, "Morning"),
  p("Text two."),
  BREAK_PIECE,
  p("Text three."),
  h(2, "Chapter 2"),
  h(3, "The Island"),
  p("Text four."),
  h(1, "Part Two"),
  h(2, "Chapter 3"),
  p("Text five."),
]

describe("splitting at headings", () => {
  it("starts chapters at their headings' level, acts at parts above them, and scenes at the level below and at breaks", () => {
    expect(outlineOf(PARTS)).toEqual([
      ["The Ferry · act Part One: Arrival", "Text one.", "Morning: Text two.", "Text three."],
      ["The Island", "Text four."],
      ["(untitled) · act Part Two", "Text five."],
    ])
  })

  it("keeps each chapter whole when scenes aren't wanted, their headings in the text", () => {
    expect(outlineOf(PARTS, { scenes: false })).toEqual([
      ["The Ferry · act Part One: Arrival", "Text one. / h2:Morning / Text two. / *** / Text three."],
      ["The Island", "Text four."],
      ["(untitled) · act Part Two", "Text five."],
    ])
  })

  it("offers each level that makes chapters, lines, and none, and picks the level that says Chapter", () => {
    const analysis = analyzeManuscript(PARTS)
    expect(analysis.choices.map((choice) => [modeKey(choice.mode), choice.chapters])).toEqual([
      ["h2", 3],
      ["h3", 4],
      ["lines", 3],
      ["none", 1],
    ])
    expect(analysis.settings).toEqual({ mode: { kind: "headings", level: 2 }, scenes: true })
    expect(outlineOf(PARTS, { mode: { kind: "none" } })).toEqual([
      ["(untitled)", "h2:Part One: Arrival / h3:Chapter 1: The Ferry / Text one. / h3:Morning / Text two.", "Text three. / h3:Chapter 2 / h3:The Island / Text four. / h2:Part Two / h3:Chapter 3 / Text five."],
    ])
  })

  it("takes a title for a chapter heading that's just a label from the line after, if it reads as one", () => {
    const pieces = [
      h(1, "Chapter One"),
      p("The Ferry"),
      p("Mara stood at the rail."),
      h(1, "Chapter Two"),
      centred("An Island, Again."),
      p("Text."),
      h(1, "Chapter Three"),
      p("Mara woke early."),
      p("Text."),
      h(1, "CHAPTER IV"),
      p("THE LIGHTHOUSE KEEPER'S DAUGHTER"),
      p("Text."),
      h(1, "Chapter 5", "The Return"),
      p("Text."),
    ]
    expect(outlineOf(pieces)).toEqual([
      ["The Ferry", "Mara stood at the rail."],
      ["An Island, Again", "Text."],
      ["(untitled)", "Mara woke early. / Text."],
      ["THE LIGHTHOUSE KEEPER'S DAUGHTER", "Text."],
      ["The Return", "Text."],
    ])
  })

  it("makes headings above the chapters' level acts, and keeps those deeper than the scenes' in the text", () => {
    const pieces = [
      h(1, "The Coast"),
      h(2, "Chapter 1"),
      p("A."),
      h(3, "Dawn"),
      p("B."),
      h(4, "A note"),
      p("C."),
      h(2, "Prologue to the Rest"),
      p("D."),
      h(1, "The Island"),
      h(2, "Lost"),
      p("E."),
    ]
    expect(outlineOf(pieces)).toEqual([
      ["(untitled) · act The Coast", "A.", "Dawn: B. / h3:A note / C."],
      ["Prologue to the Rest", "D."],
      ["Lost · act The Island", "E."],
    ])
  })

  it("finds a chapter or two typed as plain lines in a book whose chapter headings say Chapter", () => {
    expect(outlineOf([h(1, "Chapter 1"), p("A."), p("Chapter 2"), p("B."), h(1, "Chapter 3"), p("C.")])).toEqual([
      ["(untitled)", "A."],
      ["(untitled)", "B."],
      ["(untitled)", "C."],
    ])
  })
})

describe("splitting at lines", () => {
  it("finds chapter and part lines in plain text, with the title page before them left out", () => {
    const pieces = textPieces(
      "The Salt Ledger",
      "by Ann Lee",
      "PART ONE",
      "Chapter 1",
      "The Ferry",
      "Mara stood at the rail.",
      "* * *",
      "She went below.",
      "Chapter 2: The Island",
      "Gulls.",
      "Part Two: Home",
      "Chapter Three. The Return",
      "Rain.",
      "THE END",
    )
    expect(outlineOf(pieces)).toEqual([
      ["(untitled) · left out", "The Salt Ledger / by Ann Lee"],
      ["The Ferry · act PART ONE", "Mara stood at the rail.", "She went below."],
      ["The Island", "Gulls."],
      ["The Return · act Part Two: Home", "Rain."],
    ])
    expect(details(pieces)).toEqual({ title: "The Salt Ledger", author: "Ann Lee" })
  })

  it("takes bare numbers for chapters only while they count up, from 1 again in each part", () => {
    expect(
      outlineOf(textPieces("1", "Text one.", "2.", "Text two, with 3 apples.", "12", "Text three.", "3: The End Game", "Text four.", "II", "Text five.")),
    ).toEqual([
      ["(untitled)", "Text one."],
      ["(untitled)", "Text two, with 3 apples. / 12 / Text three."],
      ["The End Game", "Text four. / II / Text five."],
    ])
    expect(outlineOf(textPieces("Part One", "I", "Alpha.", "II", "Beta.", "Part Two", "I", "Gamma.", "II", "Delta.", "1", "Stray."))).toEqual([
      ["(untitled) · act Part One", "Alpha."],
      ["(untitled)", "Beta."],
      ["(untitled) · act Part Two", "Gamma."],
      ["(untitled)", "Delta. / 1 / Stray."],
    ])
  })

  it("leaves bare numbers in the text of a book whose chapters say Chapter", () => {
    expect(outlineOf(textPieces("Chapter 1", "Text.", "2", "More."))).toEqual([["(untitled)", "Text. / 2 / More."]])
  })

  it("doesn't take a sentence for a chapter's line", () => {
    expect(outlineOf(textPieces("Chapter 1", "Text.", "Chapter 2 was where it went wrong.", "Chapter two of her life began."))).toEqual([
      ["(untitled)", "Text. / Chapter 2 was where it went wrong. / Chapter two of her life began."],
    ])
  })

  it("splits at lines when they find many more chapters than headings, which then start acts", () => {
    const pieces = [
      h(1, "The Coast"),
      p("Chapter 1"),
      p("A."),
      p("Chapter 2"),
      p("B."),
      p("Chapter 3"),
      p("C."),
      h(1, "The Island"),
      p("Chapter 4"),
      p("D."),
      p("Chapter 5"),
      p("E."),
    ]
    expect(analyzeManuscript(pieces).settings.mode).toEqual({ kind: "lines" })
    expect(outlineOf(pieces)).toEqual([
      ["(untitled) · act The Coast", "A."],
      ["(untitled)", "B."],
      ["(untitled)", "C."],
      ["(untitled) · act The Island", "D."],
      ["(untitled)", "E."],
    ])
    expect(outlineOf(pieces, { mode: { kind: "headings", level: 1 } })).toEqual([
      ["The Coast", "Chapter 1 / A. / Chapter 2 / B. / Chapter 3 / C."],
      ["The Island", "Chapter 4 / D. / Chapter 5 / E."],
    ])
  })
})

describe("front and back matter", () => {
  it("leaves out a contents page and its heading", () => {
    const { pieces } = readMarkdown(
      [
        "# The Salt Ledger",
        "## Contents",
        "Chapter 1: The Ferry ....... 3",
        "Chapter 2 The Island 9",
        "## Chapter 1: The Ferry",
        "Text one.",
        "## Chapter 2 The Island",
        "Text two.",
      ].join("\n\n"),
    )
    expect(outlineOf(pieces)).toEqual([
      ["The Ferry", "Text one."],
      ["The Island", "Text two."],
    ])
  })

  it("leaves out short front matter to begin with, but not long front matter or a book that's all one chapter", () => {
    expect(outlineOf([p("For M."), h(1, "Chapter 1"), p("Text.")])).toEqual([["(untitled) · left out", "For M."], ["(untitled)", "Text."]])
    const long = "word ".repeat(600).trim()
    expect(outlineOf([p(long), h(1, "Chapter 1"), p("Text.")])[0][0]).toBe("(untitled)")
    expect(outlineOf([p("For M."), p("Text.")])).toEqual([["(untitled)", "For M. / Text."]])
  })

  it("leaves out THE END at the end, and only there", () => {
    expect(outlineOf([h(1, "Chapter 1"), p("The end of the pier."), p("END"), h(1, "Chapter 2"), p("Text."), centred("The End.")])).toEqual([
      ["(untitled)", "The end of the pier. / END"],
      ["(untitled)", "Text."],
    ])
  })

  it("passes on an act started by a heading with nothing after it, or by a contents page's line", () => {
    expect(outlineOf([h(1, "Part One"), BREAK_PIECE, h(2, "Chapter 1"), p("A.")], { scenes: false })).toEqual([
      ["(untitled) · act Part One", "A."],
    ])
    expect(outlineOf(textPieces("Part One", "Chapter 1 ..... 3", "Chapter 2 ..... 9", "Chapter 1", "Text.", "Chapter 2", "More."))).toEqual([
      ["(untitled) · act Part One", "Text."],
      ["(untitled)", "More."],
    ])
  })
})

describe("the book's title and author", () => {
  const titleOf = (pieces: Piece[]) => analyzeManuscript(pieces).titleIndex

  it("finds the title heading", () => {
    expect(titleOf([p("Draft 3"), h(0, "The Salt Ledger"), h(1, "Chapter 1"), p("Text.")])).toBe(1)
    expect(titleOf([h(1, "The Salt Ledger"), p("A novel"), h(1, "Chapter 1"), p("A."), h(1, "Chapter 2"), p("B.")])).toBe(0)
    expect(titleOf([h(1, "The Ferry"), p("Text.")])).toBe(0)
    expect(titleOf([h(1, "The Ferry"), p("Text."), h(1, "The Island"), p("Text.")])).toBeNull()
    expect(titleOf([p("Text."), h(1, "The Salt Ledger"), h(2, "Chapter 1"), p("Text.")])).toBeNull()
    expect(titleOf([h(1, "Prologue"), p("Text."), h(1, "Chapter 1"), p("Text.")])).toBeNull()
    expect(titleOf([h(1, "The Book"), p("word ".repeat(100)), h(1, "Chapter 1"), p("Text.")])).toBeNull()
  })

  it("suggests the title and author from the title heading or a title page", () => {
    expect(details([h(1, "The Salt Ledger"), p("A Novel"), p("by Mary-Kate van der Berg"), h(1, "Chapter 1"), p("Text.")])).toEqual({
      title: "The Salt Ledger",
      author: "Mary-Kate van der Berg",
    })
    expect(details([centred("THE SALT LEDGER."), centred("By Ann Lee"), h(1, "Chapter 1"), p("Text.")])).toEqual({
      title: "THE SALT LEDGER",
      author: "Ann Lee",
    })
    expect(details([p("by the sea, the boats"), h(1, "Chapter 1"), p("Text.")])).toEqual({ title: "", author: "" })
    expect(details(textPieces("A Story", "by Ann Lee", "It was late."))).toEqual({ title: "A Story", author: "Ann Lee" })
    expect(details(textPieces("A Story", "by Jo deLancey & Ann Lee", "It was late.")).author).toBe("Jo deLancey & Ann Lee")
  })
})

describe("long and crafted lines", () => {
  const timed = <T>(read: () => T) => {
    const start = performance.now()
    const result = read()
    return { result, ms: performance.now() - start }
  }

  it("rules out a line in capitals as a byline at once", () => {
    // Took seconds when a failing line was cut into words every way there is, and doubled with each capital.
    const { result, ms } = timed(() => details([p("The Long Tide"), p("BY ABCDEFGHIJKLMNOPQRSTUVWXYZABCD!"), h(1, "Chapter 1"), p("Text.")]))
    expect(result.author).toBe("")
    expect(ms).toBeLessThan(250)
  })

  it("reads a heading with a long run of dots at once", () => {
    // Looking for a page number after the dots took seconds when tried from each dot in turn.
    const { result, ms } = timed(() => outlineOf([h(1, "A"), p("Text."), h(1, `${".".repeat(100_000)}x`), h(1, "B"), p("More.")]))
    expect(result.at(-1)).toEqual(["B", "More."])
    expect(ms).toBeLessThan(500)
  })

  it("still takes a contents page's line with a long leader for the chapter it lists", () => {
    expect(outlineOf([h(1, "Part One"), h(2, `Chapter 1 ${".".repeat(10_000)} 3`), h(2, "Chapter 1"), p("Text.")])).toEqual([
      ["(untitled) · act Part One", "Text."],
    ])
  })
})

describe("numberValue", () => {
  it("reads digits, Roman numerals and words", () => {
    expect(["12", "XIV", "mcmxcix", "Twenty-One", "forty two", "one hundred", "zero", "eleventy"].map(numberValue)).toEqual([
      12,
      14,
      1999,
      21,
      42,
      100,
      0,
      null,
    ])
  })
})

describe("exported books", () => {
  const manuscript: Manuscript = {
    title: "The Salt Ledger",
    author: "Ann Lee",
    words: 1234,
    chapters: [
      { id: "a", number: null, title: "Prologue", blocks: paras("Fog over the harbor.") },
      {
        id: "b",
        number: 1,
        title: "The Ferry Home",
        blocks: [para(text("The ferry "), text("docked", "italic"), text(".")), sceneBreak, ...paras("Gulls.")],
      },
      { id: "c", number: 2, title: "", blocks: paras("Rain on the roof.") },
    ],
  }
  const chapters = [
    ["Prologue", "Fog over the harbor."],
    ["The Ferry Home", "The ferry docked.", "Gulls."],
    ["(untitled)", "Rain on the roof."],
  ]

  it("reads a Word export back as it was", async () => {
    const { pieces } = readDocx(await manuscriptDocx(manuscript, { headings: "number-title", font: "times", paper: "letter" }))
    expect(outlineOf(pieces)).toEqual([["(untitled) · left out", "Ann Lee about 1,200 words / The Salt Ledger / by Ann Lee"], ...chapters])
    expect(details(pieces)).toEqual({ title: "The Salt Ledger", author: "Ann Lee" })
  })

  it("reads a Markdown export back as it was", () => {
    const { pieces } = readSource("book.md", new TextEncoder().encode(markdownBook(manuscript, "number-title"))).manuscript
    expect(outlineOf(pieces)).toEqual([["(untitled) · left out", "by Ann Lee"], ...chapters])
    expect(details(pieces)).toEqual({ title: "The Salt Ledger", author: "Ann Lee" })
  })

  it("reads a text export back as it was, with chapters headed either way", () => {
    for (const headings of ["number-title", "number", "title"] as const) {
      const { pieces } = readSource("book.txt", new TextEncoder().encode(textBook(manuscript, headings))).manuscript
      expect(details(pieces)).toEqual({ title: "The Salt Ledger", author: "Ann Lee" })
      if (headings === "title") continue
      expect(outlineOf(pieces)).toEqual([
        ["(untitled) · left out", "The Salt Ledger / by Ann Lee"],
        ...(headings === "number" ? chapters.map(([, ...scenes], index) => [index === 0 ? "Prologue" : "(untitled)", ...scenes]) : chapters),
      ])
    }
  })
})
