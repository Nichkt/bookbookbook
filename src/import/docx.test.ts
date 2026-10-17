import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import type { Inline } from "@/export/blocks"
import { manuscriptDocx } from "@/export/docx"
import type { Manuscript } from "@/export/manuscript"
import { br, heading, para, paras, sceneBreak, text } from "@/test/blocks"
import { readDocx } from "./docx"
import { ImportError, NOT_A_DOCX } from "./errors"
import { BREAK_PIECE, type Piece } from "./pieces"

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_DOCUMENT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const CORE = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"

interface Parts {
  styles?: string
  core?: string
  /** Where the main document is, to check it's found by the package's relationships. */
  main?: string
  namespace?: string
}

/** A .docx with the body and styles given. */
function docx(body: string, { styles, core, main = "word/document.xml", namespace = W }: Parts = {}): Uint8Array {
  const folder = main.slice(0, main.lastIndexOf("/") + 1)
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${RELS}">` +
        `<Relationship Id="rId1" Type="${OFFICE_DOCUMENT}" Target="${main}"/>` +
        `<Relationship Id="rId2" Type="${CORE}" Target="docProps/core.xml"/></Relationships>`,
    ),
    [main]: strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`),
  }
  if (styles !== undefined) files[`${folder}styles.xml`] = strToU8(`<w:styles xmlns:w="${namespace}">${styles}</w:styles>`)
  if (core !== undefined) {
    files["docProps/core.xml"] = strToU8(
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/">${core}</cp:coreProperties>`,
    )
  }
  return zipSync(files)
}

const p = (runs: string, properties = "") => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs}</w:p>`
const r = (value: string, properties = "") =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${value}</w:t></w:r>`
const styled = (style: string, runs: string) => p(runs, `<w:pStyle w:val="${style}"/>`)

const block = (...inlines: Inline[]): Piece => ({ type: "block", block: para(...inlines) })

describe("readDocx", () => {
  it("reads paragraphs with their bold, italic, underline and strikethrough", () => {
    const { pieces } = readDocx(
      docx(
        p(r("Bold", "<w:b/>") + r(" and ") + r("italic", `<w:i w:val="1"/>`) + r(", ") + r("under", `<w:u w:val="single"/>`)) +
          p(r("gone", "<w:strike/>") + r(" twice", "<w:dstrike/>") + r(" not", `<w:b w:val="false"/><w:u w:val="none"/>`)),
      ),
    )
    expect(pieces).toEqual([
      block(text("Bold", "bold"), text(" and "), text("italic", "italic"), text(", "), text("under", "underline")),
      block(text("gone twice", "strike"), text(" not")),
    ])
  })

  it("finds headings by their style's name, outline level or Word's own id", () => {
    const styles =
      `<w:style w:type="paragraph" w:styleId="H"><w:name w:val="heading 2"/><w:rPr><w:b/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Big"><w:name w:val="Chapter Title"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Bigger"><w:name w:val="Mine"/><w:basedOn w:val="Big"/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="T"><w:name w:val="Title"/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="Quote"/></w:style>`
    const { pieces } = readDocx(
      docx(
        styled("T", r("The Book")) +
          styled("Big", r("One")) +
          styled("Bigger", r("Two")) +
          styled("H", r("Scene") + r(" Ship", "<w:i/>")) +
          // Not a heading, whatever its id says, as the document says what the style is.
          styled("Heading3", r("Quoted")) +
          // Missing from the styles: Word's own ids.
          styled("Heading4", r("Deep")) +
          p(r("Promoted"), `<w:outlineLvl w:val="1"/>`) +
          p(r("Body"), `<w:pStyle w:val="H"/><w:outlineLvl w:val="9"/>`),
        { styles },
      ),
    )
    expect(pieces).toEqual([
      { type: "heading", level: 0, inlines: [text("The Book")] },
      { type: "heading", level: 1, inlines: [text("One")] },
      { type: "heading", level: 1, inlines: [text("Two")] },
      // The heading style's bold is how headings look; the italic was put on the words.
      { type: "heading", level: 2, inlines: [text("Scene"), text(" Ship", "italic")] },
      block(text("Quoted")),
      { type: "heading", level: 4, inlines: [text("Deep")] },
      { type: "heading", level: 2, inlines: [text("Promoted")] },
      block(text("Body", "bold")),
    ])
  })

  it("applies formatting from the defaults, paragraph styles, character styles and the run, in that order", () => {
    const styles =
      `<w:docDefaults><w:rPrDefault><w:rPr><w:u w:val="single"/></w:rPr></w:rPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Loud"><w:name w:val="Loud"/><w:rPr><w:b/><w:u w:val="none"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Louder"><w:name w:val="Louder"/><w:basedOn w:val="Loud"/><w:rPr><w:i/></w:rPr></w:style>` +
      `<w:style w:type="character" w:styleId="Calm"><w:name w:val="Calm"/><w:rPr><w:b w:val="0"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Loop"><w:name w:val="Loop"/><w:basedOn w:val="Loop"/></w:style>`
    const { pieces } = readDocx(
      docx(
        p(r("plain")) +
          styled("Louder", r("loud") + r("calm", `<w:rStyle w:val="Calm"/>`) + r("odd", `<w:rStyle w:val="Calm"/><w:b/>`)) +
          styled("Loop", r("loop")),
        { styles },
      ),
    )
    expect(pieces).toEqual([
      block(text("plain", "underline")),
      block(text("loud", "bold", "italic"), text("calm", "italic"), text("odd", "bold", "italic")),
      block(text("loop", "underline")),
    ])
  })

  it("reads tracked changes as accepted, and leaves out hidden text, field codes, contents and drawings", () => {
    const field = (code: string, result: string) =>
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>${code}</w:instrText></w:r>` +
      `<w:r><w:t>${code}</w:t></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(result)}` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
    const contents =
      `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr>` +
      `<w:sdtContent>${p(r("Chapter 1 ..... 3"))}</w:sdtContent></w:sdt>`
    const styles = `<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>`
    const { pieces } = readDocx(
      docx(
        contents +
          styled("TOC1", r("Chapter 2 ..... 9")) +
          p(
            r("Kept") +
              `<w:del><w:r><w:delText>cut</w:delText></w:r></w:del>` +
              `<w:ins>${r(" added")}</w:ins>` +
              r(" secret", "<w:vanish/>") +
              field("PAGE", " 12") +
              `<w:hyperlink r:id="rId9" xmlns:r="x">${r(" linked")}</w:hyperlink>` +
              `<w:r><mc:AlternateContent xmlns:mc="m"><mc:Fallback><w:t>box</w:t></mc:Fallback></mc:AlternateContent></w:r>` +
              `<w:sdt><w:sdtContent>${r(" controlled")}</w:sdtContent></w:sdt>`,
          ) +
          `<w:tbl><w:tr><w:tc>${p(r("In a table"))}</w:tc></w:tr></w:tbl>` +
          `<w:sectPr><w:headerReference w:type="default"/></w:sectPr>`,
        { styles },
      ),
    )
    expect(pieces).toEqual([block(text("Kept added 12 linked controlled")), block(text("In a table"))])
  })

  it("follows a field across paragraphs", () => {
    const { pieces } = readDocx(
      docx(
        p(`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>TOC \\o</w:instrText></w:r>`) +
          p(r("code still")) +
          p(`<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r("Result")}`) +
          p(`<w:r><w:fldChar w:fldCharType="end"/></w:r>${r("After")}`),
      ),
    )
    expect(pieces).toEqual([block(text("Result")), block(text("After"))])
  })

  it("reads on after fields nested, never ended, or marked out of turn", () => {
    const mark = (type: string) => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`
    const code = (value: string) => `<w:r><w:instrText>${value}</w:instrText></w:r>`
    const { pieces } = readDocx(
      docx(
        p(mark("end") + mark("separate") + r("Stray")) +
          p(mark("begin") + code("IF") + mark("begin") + code("PAGE") + mark("separate") + r("inner") + mark("end") + r("code")) +
          p(mark("separate") + r("Shown") + mark("separate") + r(" twice") + mark("end")) +
          p(mark("begin") + code("PAGE") + mark("separate") + r("12")) +
          p(mark("begin") + code("NUMPAGES") + mark("separate") + r("30")) +
          p(r("Open")),
      ),
    )
    expect(pieces).toEqual([block(text("Stray")), block(text("Shown twice")), block(text("12")), block(text("30")), block(text("Open"))])
  })

  it("reads line breaks, tabs and hyphens, centring, and scene breaks", () => {
    const styles = `<w:style w:type="paragraph" w:styleId="Mid"><w:name w:val="Mid"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>`
    const { pieces } = readDocx(
      docx(
        p(`<w:r><w:t>One</w:t><w:br/><w:t>two</w:t><w:tab/><w:t>three</w:t><w:noBreakHyphen/><w:t>four</w:t><w:br w:type="page"/></w:r>`) +
          p(r("* * *"), `<w:jc w:val="center"/>`) +
          styled("Mid", r("Middle")) +
          p(r("Left"), `<w:pStyle w:val="Mid"/><w:jc w:val="left"/>`) +
          p(r("  ")) +
          p(r("#")),
        { styles },
      ),
    )
    expect(pieces).toEqual([
      block(text("One"), br, text("two three-four")),
      BREAK_PIECE,
      { type: "block", block: { type: "paragraph", inlines: [text("Middle")], center: true } },
      block(text("Left")),
      BREAK_PIECE,
    ])
  })

  it("reads the title and author from the file's details, but not a placeholder author", () => {
    const core = (creator: string) => `<dc:title> The  Salt Ledger </dc:title><dc:creator>${creator}</dc:creator>`
    expect(readDocx(docx(p(r("Hi")), { core: core("Ann Lee") }))).toMatchObject({ title: "The Salt Ledger", author: "Ann Lee" })
    expect(readDocx(docx(p(r("Hi")), { core: core("Microsoft Office User") })).author).toBe("")
    expect(readDocx(docx(p(r("Hi"))))).toMatchObject({ title: "", author: "" })
  })

  it("finds the main document where the package says, in Word's strict namespace too", () => {
    const { pieces } = readDocx(
      docx(p(r("Strict")), { main: "Content/Main.xml", namespace: "http://purl.oclc.org/ooxml/wordprocessingml/main" }),
    )
    expect(pieces).toEqual([block(text("Strict"))])
  })

  it("throws an ImportError for a file that isn't a Word document", () => {
    const expectNotDocx = (data: Uint8Array) => {
      expect(() => readDocx(data)).toThrow(ImportError)
      expect(() => readDocx(data)).toThrow(NOT_A_DOCX)
    }
    expectNotDocx(strToU8("Just some text, not a zip at all."))
    expectNotDocx(zipSync({ "notes.txt": strToU8("hello") }))
    expectNotDocx(zipSync({ "word/document.xml": strToU8("<w:document><w:body") }))
  })

  it("reads back a manuscript exported as Word", async () => {
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
          blocks: [
            para(text("The ferry "), text("docked", "italic"), text("."), br, text("Then quiet.")),
            sceneBreak,
            heading(2, text("Later")),
            para(text("Salt & smoke.", "bold")),
          ],
        },
      ],
    }
    const read = readDocx(await manuscriptDocx(manuscript, { headings: "number-title", font: "times", paper: "letter" }))
    expect(read.title).toBe("The Salt Ledger")
    expect(read.author).toBe("Ann Lee")
    expect(read.pieces).toEqual([
      block(text("Ann Lee about 1,200 words")),
      { type: "block", block: { type: "paragraph", inlines: [text("The Salt Ledger")], center: true } },
      { type: "block", block: { type: "paragraph", inlines: [text("by Ann Lee")], center: true } },
      { type: "heading", level: 1, inlines: [text("Prologue")], center: true },
      block(text("Fog over the harbor.")),
      { type: "heading", level: 1, inlines: [text("Chapter 1"), br, text("The Ferry Home")], center: true },
      block(text("The ferry "), text("docked", "italic"), text("."), br, text("Then quiet.")),
      BREAK_PIECE,
      { type: "heading", level: 2, inlines: [text("Later")] },
      block(text("Salt & smoke.", "bold")),
      { type: "block", block: { type: "paragraph", inlines: [text("END")], center: true } },
    ])
  })
})
