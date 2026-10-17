import { strToU8 } from "fflate"
import { describe, expect, it } from "vitest"
import { para, text } from "@/test/blocks"
import { ImportError, NO_TEXT, NOT_A_DOCX, OLD_WORD_FILE, TOO_BIG, UNSUPPORTED_FILE } from "./errors"
import { fileKind, MAX_DOCX_BYTES, MAX_TEXT_BYTES, readFile, readPaste, readSource, withParagraphing } from "./read"

describe("fileKind", () => {
  it("knows Word, Markdown and text files by their extension", () => {
    expect(fileKind("Book.DOCX")).toBe("docx")
    expect(fileKind("notes.md")).toBe("markdown")
    expect(fileKind("notes.markdown")).toBe("markdown")
    expect(fileKind("draft.txt")).toBe("text")
    expect(fileKind("draft.final.TEXT")).toBe("text")
  })

  it("says why it can't read the rest", () => {
    expect(() => fileKind("old.doc")).toThrow(OLD_WORD_FILE)
    expect(() => fileKind("book.pdf")).toThrow(UNSUPPORTED_FILE)
    expect(() => fileKind("README")).toThrow(ImportError)
    expect(() => fileKind("folder.md/book")).toThrow(UNSUPPORTED_FILE)
  })
})

describe("readSource", () => {
  it("reads plain text with its paragraphs guessed, keeping the text to read again", () => {
    const source = readSource("C:\\Books\\The Ledger.v2.txt", strToU8("Roses are red,\nviolets blue.\n\nSugar."))
    expect(source).toMatchObject({ kind: "text", name: "The Ledger.v2", paragraphing: "blank-lines" })
    expect(source.manuscript.pieces).toHaveLength(2)
    const again = withParagraphing(source, "lines")
    expect(again).toMatchObject({ kind: "text", name: "The Ledger.v2", paragraphing: "lines", text: source.text })
    expect(again.manuscript.pieces).toHaveLength(3)
  })

  it("reads Markdown, with nothing to read again", () => {
    const source = readSource("book.md", strToU8("# Title\n\nText."))
    expect(source).toMatchObject({ kind: "markdown", name: "book" })
    expect(source.text).toBeUndefined()
    expect(withParagraphing(source, "lines")).toBe(source)
  })

  it("throws for a file too big, not a Word document, or without words", () => {
    expect(() => readSource("big.txt", new Uint8Array(MAX_TEXT_BYTES + 1))).toThrow(TOO_BIG)
    expect(() => readSource("fake.docx", strToU8("Not a zip."))).toThrow(NOT_A_DOCX)
    expect(() => readSource("empty.md", strToU8(""))).toThrow(NO_TEXT)
    expect(() => readSource("breaks.txt", strToU8("* * *\n\n#\n"))).toThrow(NO_TEXT)
  })
})

describe("readFile", () => {
  it("checks the size before reading the file", async () => {
    const unread = (name: string, size: number) => ({
      name,
      size,
      arrayBuffer: () => Promise.reject(new Error("Read it anyway")),
    })
    await expect(readFile(unread("big.docx", MAX_DOCX_BYTES + 1))).rejects.toThrow(TOO_BIG)
    await expect(readFile(unread("big.md", MAX_TEXT_BYTES + 1))).rejects.toThrow(TOO_BIG)
    await expect(readFile(unread("book.pdf", 10))).rejects.toThrow(UNSUPPORTED_FILE)
  })

  it("reads the file", async () => {
    const bytes = strToU8("Text.")
    const source = await readFile({ name: "a.txt", size: bytes.length, arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer) })
    expect(source.manuscript.pieces).toEqual([{ type: "block", block: para(text("Text.")) }])
  })
})

describe("readPaste", () => {
  it("reads a paste with Markdown's headings as Markdown, and anything else as plain text", () => {
    const markdown = readPaste("# Chapter One\n\nText.")
    expect(markdown).toMatchObject({ kind: "paste", name: "" })
    expect(markdown.text).toBeUndefined()
    expect(markdown.manuscript.pieces[0]).toMatchObject({ type: "heading", level: 1 })
    expect(readPaste("#hashtag\nText.")).toMatchObject({ kind: "paste", text: "#hashtag\nText.", paragraphing: "lines" })
    expect(() => readPaste("  \n\n")).toThrow(NO_TEXT)
  })
})
