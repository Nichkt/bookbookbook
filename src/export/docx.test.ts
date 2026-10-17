import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { br, heading, list, para, paras, quote, sceneBreak, text } from "@/test/blocks"
import { defaultPaper, manuscriptDocx, shortTitle, surname, wordCount, type DocxOptions } from "./docx"
import type { Manuscript } from "./manuscript"

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
        para(br, text("The ferry "), text("docked", "italic"), text("."), br, text("Then\u0007 quiet & still."), br),
        sceneBreak,
        quote(para(text("Salt keeps."))),
        list(true, [[para(text("one"))], [para(text("two"))]]),
        heading(2, text("Later")),
      ],
    },
  ],
}

const OPTIONS: DocxOptions = { headings: "number-title", font: "times", paper: "letter" }

async function open(book: Manuscript, options: DocxOptions = OPTIONS) {
  const files = unzipSync(await manuscriptDocx(book, options))
  const read = (name: string) => strFromU8(files[name])
  const headers = Object.keys(files).filter((name) => /^word\/header\d+\.xml$/.test(name))
  return { names: Object.keys(files), document: read("word/document.xml"), headers: headers.map(read), read }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

/** Each paragraph's text, with tabs and line breaks. */
function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map(([, body]) =>
      [...body.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:(tab|br)\/>/g)]
        .map(([, chunk, tag]) => chunk ?? (tag === "tab" ? "\t" : "\n"))
        .join("")
        .replace(/&(\w+);/g, (entity, name: string) => ENTITIES[name] ?? entity),
    )
    .filter(Boolean)
}

const count = (xml: string, pattern: RegExp) => xml.match(pattern)?.length ?? 0

describe("manuscriptDocx", () => {
  it("sets out a title page, then the chapters", async () => {
    const { document } = await open(manuscript)
    expect(paragraphs(document)).toEqual([
      "Ann Lee\tabout 1,200 words",
      "The Salt Ledger",
      "by Ann Lee",
      "Prologue",
      "Fog over the harbor.",
      "Chapter 1\nThe Ferry Home",
      "The ferry docked.\nThen quiet & still.",
      "#",
      "Salt keeps.",
      "1.\tone",
      "2.\ttwo",
      "Later",
      "END",
    ])
    expect(document).toContain("<w:i/>")
    expect(document).not.toContain("\u0007")
  })

  it("starts each chapter on a new page, headed so Word can find it", async () => {
    const { document } = await open(manuscript)
    expect(count(document, /<w:pStyle w:val="Heading1"\/>/g)).toBe(2)
    expect(count(document, /<w:pStyle w:val="Heading2"\/>/g)).toBe(1)
    // The first chapter starts a section, which starts a page.
    expect(count(document, /<w:pageBreakBefore\/>/g)).toBe(1)
    expect(document).toMatch(/<w:pgNumType w:start="1"/)
  })

  it("heads every page but the title page with surname, title and page number", async () => {
    const { document, headers } = await open(manuscript)
    expect(count(document, /<w:headerReference /g)).toBe(1)
    expect(headers).toHaveLength(1)
    expect(paragraphs(headers[0])).toEqual(["Lee / THE SALT LEDGER / "])
    expect(headers[0]).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/)
  })

  it("leaves the author out when there isn't one", async () => {
    const { document, headers } = await open({ ...manuscript, author: "", words: 3 })
    expect(paragraphs(document).slice(0, 3)).toEqual(["\t3 words", "The Salt Ledger", "Prologue"])
    expect(paragraphs(headers[0])).toEqual(["THE SALT LEDGER / "])
  })

  it("uses the font and paper chosen", async () => {
    const letter = await open(manuscript)
    expect(letter.document).toMatch(/<w:pgSz w:w="12240" w:h="15840"/)
    expect(letter.read("word/styles.xml")).toContain("Times New Roman")

    const a4 = await open(manuscript, { headings: "title", font: "courier", paper: "a4" })
    expect(a4.document).toMatch(/<w:pgSz w:w="11906" w:h="16838"/)
    expect(a4.read("word/styles.xml")).toContain("Courier New")
    expect(a4.read("word/styles.xml")).not.toContain("Times New Roman")
    expect(paragraphs(a4.document)).toContain("The Ferry Home")
  })

  it("gives the title and author as the file's properties", async () => {
    const core = (await open(manuscript)).read("docProps/core.xml")
    expect(core).toMatch(/<dc:title>The Salt Ledger<\/dc:title>/)
    expect(core).toMatch(/<dc:creator>Ann Lee<\/dc:creator>/)
  })
})

describe("wordCount", () => {
  it("rounds as manuscripts do", () => {
    expect(wordCount(0)).toBe("0 words")
    expect(wordCount(1)).toBe("1 word")
    expect(wordCount(99)).toBe("99 words")
    expect(wordCount(1234)).toBe("about 1,200 words")
    expect(wordCount(9_960)).toBe("about 10,000 words")
    expect(wordCount(87_432)).toBe("about 87,000 words")
  })
})

describe("surname", () => {
  it("finds the surname, particles and all", () => {
    expect(surname("Ann Lee")).toBe("Lee")
    expect(surname("Ursula K. Le Guin")).toBe("Le Guin")
    expect(surname("Ludwig van Beethoven")).toBe("van Beethoven")
    expect(surname("Anne de la Fontaine")).toBe("de la Fontaine")
    expect(surname("De Niro")).toBe("De Niro")
    expect(surname("Plato")).toBe("Plato")
    expect(surname("")).toBe("")
  })

  it("passes over suffixes", () => {
    expect(surname("Martin Luther King, Jr.")).toBe("King")
    expect(surname("Harold Smith III")).toBe("Smith")
  })
})

describe("shortTitle", () => {
  it("capitalises a short title", () => {
    expect(shortTitle("  The Salt   Ledger ")).toBe("THE SALT LEDGER")
  })

  it("cuts a long one at a word", () => {
    expect(shortTitle("The Salt Ledger of Grayhaven Harbor: Being an Account")).toBe("THE SALT LEDGER OF GRAYHAVEN HARBOR")
    // A word that ends right at the limit stays.
    expect(shortTitle(`${"x".repeat(35)} abcd efgh`)).toBe(`${"X".repeat(35)} ABCD`)
  })

  it("cuts mid-word rather than leave too little", () => {
    expect(shortTitle(`A ${"y".repeat(50)}`)).toBe(`A ${"Y".repeat(38)}`)
    expect(shortTitle("z".repeat(50))).toBe("Z".repeat(40))
  })

  it("never splits a character", () => {
    const cut = shortTitle(`${"a".repeat(39)}🙂🙂 tail`)
    expect(Array.from(cut)).toHaveLength(40)
    expect(cut.endsWith("🙂")).toBe(true)
  })
})

describe("defaultPaper", () => {
  it("chooses Letter where it's the norm", () => {
    expect(["en-US", "es-MX", "fr-CA", "en-PH", "en-us"].map(defaultPaper)).toEqual(Array(5).fill("letter"))
    expect(["en-GB", "de-DE", "en", "fr"].map(defaultPaper)).toEqual(Array(4).fill("a4"))
  })
})
