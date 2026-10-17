import { describe, expect, it } from "vitest"
import type { Inline } from "@/export/blocks"
import { br, para, text } from "@/test/blocks"
import { BREAK_PIECE, type Piece } from "./pieces"
import { decodeText, guessParagraphing, readPlainText } from "./text"

const block = (...inlines: Inline[]): Piece => ({ type: "block", block: para(...inlines) })
const lines = (...values: string[]) => values.map((value) => block(text(value)))

/** Lines of 50 to 70 characters, wrapped as an e-text's are. */
const WRAPPED = [
  "The harbor lights came on one by one as the ferry rounded the",
  "point, and Mara counted them the way her father had taught her,",
  "slowly, from the lighthouse to the cannery and back again.",
  "",
  "Nobody met the boat. She had not expected anyone to, and still",
  "she stood on the landing a long while with her bag at her feet,",
  "watching the gulls work the empty pier for scraps.",
].join("\n")

describe("decodeText", () => {
  it("reads UTF-8 with or without a byte order mark, and UTF-16 with one", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0xc3, 0xa9]))).toBe("hé")
    expect(decodeText(new TextEncoder().encode("café — “quoted”"))).toBe("café — “quoted”")
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]))).toBe("hé")
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0xe9]))).toBe("hé")
  })

  it("reads text that isn't UTF-8 as Windows' Western encoding", () => {
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x97, 0x20, 0x93, 0x71, 0x94, 0x80, 0x9f]))).toBe("café — “q”€Ÿ")
    // Bytes Windows leaves unused stay control codes, for reading to drop.
    expect(decodeText(new Uint8Array([0x61, 0x81, 0x8d, 0xff]))).toBe("a\u0081\u008dÿ")
  })
})

describe("guessParagraphing", () => {
  it("takes a line each when no blank lines part them, and blank lines when no lines sit together", () => {
    expect(guessParagraphing("One.\nTwo.\r\nThree.")).toBe("lines")
    expect(guessParagraphing("One.\n\nTwo.\n\n\nThree.")).toBe("blank-lines")
  })

  it("goes by which there are more of", () => {
    expect(guessParagraphing("Chapter 1\n\nOne.\nTwo.\nThree.\nFour.\n\nChapter 2\n\nFive.\nSix.\nSeven.")).toBe("lines")
    expect(guessParagraphing("Roses are red,\nviolets blue.\n\nSugar is sweet.\n\nAnd so on.")).toBe("blank-lines")
  })

  it("takes blank lines for text wrapped short, however many lines sit together", () => {
    expect(guessParagraphing(WRAPPED)).toBe("blank-lines")
  })
})

describe("readPlainText", () => {
  it("reads a paragraph a line, with scene breaks, and without blank lines", () => {
    expect(readPlainText("One.\nTwo.\n\n\n* * *\n#\nThree.\n", "lines")).toEqual([
      ...lines("One.", "Two."),
      BREAK_PIECE,
      BREAK_PIECE,
      ...lines("Three."),
    ])
  })

  it("reads paragraphs parted by blank lines, their lines as line breaks", () => {
    expect(readPlainText("Roses are red,\nviolets are blue.\n\nNext.\n~\nLast.", "blank-lines")).toEqual([
      block(text("Roses are red,"), br, text("violets are blue.")),
      ...lines("Next."),
      BREAK_PIECE,
      ...lines("Last."),
    ])
  })

  it("joins lines wrapped short with spaces", () => {
    const [first, second] = WRAPPED.split("\n\n").map((paragraph) => paragraph.replace(/\n/g, " "))
    expect(readPlainText(WRAPPED, "blank-lines")).toEqual(lines(first, second))
  })

  it("tidies the text: line endings, form feeds, control characters, tabs and spaces", () => {
    expect(readPlainText("\uFEFFOne\r\nTwo\rThree\fFour", "blank-lines")).toEqual([
      block(text("One"), br, text("Two"), br, text("Three")),
      ...lines("Four"),
    ])
    expect(readPlainText("  Tab\there   and\u0007 bell\u0000  \n\t\n", "lines")).toEqual(lines("Tab here and bell"))
  })
})
