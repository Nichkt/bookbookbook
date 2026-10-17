import { describe, expect, it } from "vitest"
import type { Inline } from "@/export/blocks"
import { markdownBook } from "@/export/files"
import type { Manuscript } from "@/export/manuscript"
import { heading, para, paras, quote, sceneBreak, text } from "@/test/blocks"
import { readMarkdown } from "./markdown"
import { BREAK_PIECE, type Piece } from "./pieces"

const block = (...inlines: Inline[]): Piece => ({ type: "block", block: para(...inlines) })
const headingPiece = (level: number, value: string): Piece => ({ type: "heading", level, inlines: [text(value)] })

describe("readMarkdown", () => {
  it("keeps the level top-level headings were written at, and reads scene breaks", () => {
    const { pieces } = readMarkdown(
      "# Part One\n\nChapter 1\n=========\n\nText *here*.\n\n* * *\n\n### Inner\n\n> # Quoted\n\n#\n\n~\n\n###### Deep",
    )
    expect(pieces).toEqual([
      headingPiece(1, "Part One"),
      headingPiece(1, "Chapter 1"),
      block(text("Text "), text("here", "italic"), text(".")),
      BREAK_PIECE,
      headingPiece(3, "Inner"),
      { type: "block", block: quote(heading(2, text("Quoted"))) },
      BREAK_PIECE,
      BREAK_PIECE,
      headingPiece(6, "Deep"),
    ])
  })

  it("takes the title and author from front matter when they're plain values", () => {
    const read = (yaml: string) => readMarkdown(`---\n${yaml}\n---\nText.`)
    expect(read(`title: "The \\"Salt\\" Ledger"\nauthor: 'Ann O''Lee'`)).toMatchObject({ title: `The "Salt" Ledger`, author: "Ann O'Lee" })
    expect(read(`Title:   The Salt Ledger  \nauthors: [Ann]`)).toMatchObject({ title: "The Salt Ledger", author: "" })
    expect(read(`title: [one, two]\nauthor: >\n  Ann Lee`)).toMatchObject({ title: "", author: "" })
    expect(readMarkdown("No front matter.")).toMatchObject({ title: "", author: "" })
  })

  it("reads back a manuscript exported as Markdown", () => {
    const manuscript: Manuscript = {
      title: "The Salt Ledger",
      author: "Ann Lee",
      words: 12,
      chapters: [
        { id: "a", number: null, title: "Prologue", blocks: paras("Fog over the harbor.") },
        {
          id: "b",
          number: 1,
          title: "The Ferry Home",
          blocks: [para(text("The ferry "), text("docked", "italic"), text(".")), sceneBreak, heading(2, text("Later")), ...paras("Salt.")],
        },
      ],
    }
    expect(readMarkdown(markdownBook(manuscript, "number-title")).pieces).toEqual([
      headingPiece(1, "The Salt Ledger"),
      block(text("by Ann Lee")),
      headingPiece(2, "Prologue"),
      block(text("Fog over the harbor.")),
      headingPiece(2, "Chapter 1: The Ferry Home"),
      block(text("The ferry "), text("docked", "italic"), text(".")),
      BREAK_PIECE,
      headingPiece(3, "Later"),
      block(text("Salt.")),
    ])
  })
})
