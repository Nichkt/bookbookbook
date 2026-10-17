import type * as DocxLibrary from "docx"
import type { IParagraphOptions, IRunOptions, Paragraph, TextRun } from "docx"
import type { Block, Inline, MarkName } from "./blocks"
import { chapterHeadingLines, type ChapterHeadings, type Manuscript } from "./manuscript"

/*
 * A Word manuscript in standard manuscript format (DESIGN.md §13), as agents and editors expect one: a title page
 * with the word count, then the chapters double-spaced in 12-point type, each on a new page, under a running head
 * of surname, short title and page number. Chapter headings are Word's Heading 1, so Word's navigation pane, Vellum
 * and Atticus find the chapters. The docx library is big, so it loads when a manuscript is first made.
 */

type Docx = typeof DocxLibrary

export type ManuscriptFont = "times" | "courier"
export type Paper = "letter" | "a4"

export interface DocxOptions {
  headings: ChapterHeadings
  font: ManuscriptFont
  paper: Paper
}

const FONTS: Record<ManuscriptFont, string> = { times: "Times New Roman", courier: "Courier New" }

/** Page sizes, in twentieths of a point like every length here. */
const PAPER: Record<Paper, { width: number; height: number }> = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
}

const INCH = 1440
const HALF_INCH = 720
const SINGLE_SPACED = 240
const DOUBLE_SPACED = 480
/** Twelve points, in half-points. */
const FONT_SIZE = 24
/** A Courier character, the widest a list marker's characters get. */
const CHARACTER = 144

/** Letter paper where it's the norm, A4 elsewhere. */
export const defaultPaper = (locale: string): Paper => (/-(US|CA|MX|PH)\b/i.test(locale) ? "letter" : "a4")

/** The book as a .docx file. */
export async function manuscriptDocx(manuscript: Manuscript, options: DocxOptions): Promise<Uint8Array> {
  const docx = await import("docx")
  return docx.Packer.pack(manuscriptDocument(docx, manuscript, options), "uint8array")
}

function manuscriptDocument(docx: Docx, manuscript: Manuscript, options: DocxOptions) {
  const title = xmlText(manuscript.title)
  const author = xmlText(manuscript.author)
  const font = FONTS[options.font]
  const paper = PAPER[options.paper]
  const page = {
    size: paper,
    margin: { top: INCH, right: INCH, bottom: INCH, left: INCH, header: HALF_INCH, footer: HALF_INCH, gutter: 0 },
  }
  const plainRun = { font, size: FONT_SIZE, color: "000000", bold: false, italics: false }
  const { CENTER, RIGHT } = docx.AlignmentType
  const text = (value: string, options: IRunOptions = {}) => new docx.TextRun({ ...options, text: value })
  const centered = (value: string, options: IParagraphOptions = {}) =>
    new docx.Paragraph({ ...options, alignment: CENTER, children: [text(value)] })

  const titlePage = [
    new docx.Paragraph({
      spacing: { line: SINGLE_SPACED },
      tabStops: [{ type: docx.TabStopType.RIGHT, position: paper.width - 2 * INCH }],
      children: [...(author ? [text(author)] : []), new docx.TextRun({ children: [new docx.Tab(), wordCount(manuscript.words)] })],
    }),
    centered(title, { spacing: { before: 4 * INCH } }),
    ...(author ? [centered(`by ${author}`)] : []),
  ]

  const runningHead = [author && surname(author), shortTitle(title)].filter(Boolean).join(" / ")
  const header = new docx.Header({
    children: [
      new docx.Paragraph({
        alignment: RIGHT,
        spacing: { line: SINGLE_SPACED },
        children: [new docx.TextRun({ children: [`${runningHead} / `, docx.PageNumber.CURRENT] })],
      }),
    ],
  })

  const chapters = manuscript.chapters.flatMap((chapter, index) => [
    new docx.Paragraph({
      heading: docx.HeadingLevel.HEADING_1,
      // The first starts its section's first page.
      pageBreakBefore: index > 0,
      children: chapterHeadingLines(chapter, options.headings).map((line, lineIndex) =>
        text(xmlText(line), lineIndex > 0 ? { break: 1 } : {}),
      ),
    }),
    ...chapter.blocks.flatMap((block) => blockParagraphs(docx, block, TOP_LEVEL)),
  ])

  return new docx.Document({
    title,
    creator: author,
    styles: {
      default: {
        document: {
          run: { font, size: FONT_SIZE },
          paragraph: { spacing: { line: DOUBLE_SPACED, before: 0, after: 0 } },
        },
        heading1: {
          run: plainRun,
          // A third of the way down the page, and a blank line before the text.
          paragraph: {
            alignment: CENTER,
            spacing: { before: 2.5 * INCH, after: DOUBLE_SPACED },
            keepNext: true,
            keepLines: true,
            outlineLevel: 0,
          },
        },
        heading2: { run: { ...plainRun, bold: true }, paragraph: { keepNext: true, keepLines: true, outlineLevel: 1 } },
        heading3: { run: { ...plainRun, bold: true }, paragraph: { keepNext: true, keepLines: true, outlineLevel: 2 } },
      },
    },
    sections: [
      { properties: { page }, children: titlePage },
      {
        properties: { type: docx.SectionType.NEXT_PAGE, page: { ...page, pageNumbers: { start: 1 } } },
        headers: { default: header },
        children: [...chapters, centered("END")],
      },
    ],
  })
}

/** Where a block sits: its indents from the margins, and whether it's inside a quote or list. */
interface Context {
  left: number
  right: number
  nested: boolean
}

const TOP_LEVEL: Context = { left: 0, right: 0, nested: false }

function blockParagraphs(docx: Docx, block: Block, context: Context): Paragraph[] {
  const alignment = (center: boolean | undefined): IParagraphOptions =>
    center ? { alignment: docx.AlignmentType.CENTER } : {}
  switch (block.type) {
    case "paragraph": {
      // Paragraphs indent their first line, as manuscripts do, unless centred or set in a quote or list.
      const firstLine = block.center || context.nested ? {} : { firstLine: HALF_INCH }
      const options = { ...alignment(block.center), children: runs(docx, block.inlines) }
      return [paragraph(docx, context, options, firstLine)]
    }
    case "heading": {
      const heading = block.level === 2 ? docx.HeadingLevel.HEADING_2 : docx.HeadingLevel.HEADING_3
      return [paragraph(docx, context, { heading, ...alignment(block.center), children: runs(docx, block.inlines) })]
    }
    case "break":
      // A blank line would vanish at the foot of a page.
      return [paragraph(docx, context, { ...alignment(true), children: [new docx.TextRun("#")] })]
    case "quote": {
      const inner = { left: context.left + HALF_INCH, right: context.right + HALF_INCH, nested: true }
      return block.blocks.flatMap((child) => blockParagraphs(docx, child, inner))
    }
    case "list": {
      const markers = block.items.map((_, index) => (block.ordered ? `${Math.max(0, block.start) + index}.` : "•"))
      // Room for the longest marker, so every item's text lines up.
      const longest = Math.max(...markers.map((marker) => marker.length))
      const hanging = Math.min(HALF_INCH, Math.max(HALF_INCH / 2, (longest + 0.5) * CHARACTER))
      const inner = { left: context.left + HALF_INCH, right: context.right, nested: true }
      return block.items.flatMap((item, index) => {
        const marker = new docx.TextRun({ children: [markers[index], new docx.Tab()] })
        const [first, ...rest] = item
        const leads = first?.type === "paragraph"
        return [
          paragraph(docx, inner, { children: [marker, ...(leads ? runs(docx, first.inlines) : [])] }, { hanging }),
          ...(leads ? rest : item).flatMap((child) => blockParagraphs(docx, child, inner)),
        ]
      })
    }
  }
}

function paragraph(
  docx: Docx,
  context: Context,
  options: IParagraphOptions,
  indent: { firstLine?: number; hanging?: number } = {},
) {
  const all = { ...(context.left ? { left: context.left } : {}), ...(context.right ? { right: context.right } : {}), ...indent }
  return new docx.Paragraph({ ...options, ...(Object.keys(all).length > 0 ? { indent: all } : {}) })
}

const MARK_OPTIONS: Record<MarkName, IRunOptions> = {
  bold: { bold: true },
  italic: { italics: true },
  underline: { underline: {} },
  strike: { strike: true },
}

/** Inline content as runs: a line break starts the next run, and breaks at either end are dropped. */
function runs(docx: Docx, inlines: readonly Inline[]): TextRun[] {
  const result: TextRun[] = []
  let breaks = 0
  for (const inline of inlines) {
    if (inline.type === "lineBreak") {
      if (result.length > 0) breaks++
      continue
    }
    inline.text.split(/\r\n?|\n/).forEach((part, index) => {
      if (index > 0 && result.length > 0) breaks++
      const text = xmlText(part)
      if (!text) return
      const marks = Object.assign({}, ...inline.marks.map((mark) => MARK_OPTIONS[mark])) as IRunOptions
      result.push(new docx.TextRun({ ...marks, text, ...(breaks > 0 ? { break: breaks } : {}) }))
      breaks = 0
    })
  }
  return result
}

/** Without the characters XML can't hold (pasted control codes, broken surrogates), which Word refuses to open. */
const xmlText = (text: string) => text.replace(/(?![\t\n\r])[\p{Cc}\p{Cs}\uFFFE\uFFFF]/gu, "")

/** The word count as manuscripts give it: "about 87,000 words". */
export function wordCount(words: number): string {
  const rounded = words >= 10_000 ? Math.round(words / 1000) * 1000 : words >= 100 ? Math.round(words / 100) * 100 : words
  const count = `${rounded.toLocaleString("en-US")} ${rounded === 1 ? "word" : "words"}`
  return words >= 100 ? `about ${count}` : count
}

const SUFFIX = /^(jr|sr|ii|iii|iv|phd|md)\.?$/i
const PARTICLES = new Set(["da", "de", "del", "della", "den", "der", "des", "di", "du", "la", "le", "ten", "ter", "van", "von"])

/** The surname a running head uses: "Le Guin" for "Ursula K. Le Guin", "King" for "Martin Luther King Jr." */
export function surname(author: string): string {
  const words = author.replace(/,/g, " ").split(/\s+/).filter(Boolean)
  while (words.length > 1 && SUFFIX.test(words.at(-1)!)) words.pop()
  let start = words.length - 1
  while (start > 0 && PARTICLES.has(words[start - 1].toLowerCase())) start--
  return words.slice(Math.max(0, start)).join(" ")
}

/** The title a running head uses: in capitals, cut at a word to 40 characters or so. */
export function shortTitle(title: string): string {
  // By code point, so a cut can't split an emoji into something Word won't open.
  const chars = Array.from(title.toUpperCase().replace(/\s+/g, " ").trim())
  if (chars.length <= 40) return chars.join("")
  const head = chars.slice(0, 41).join("")
  const cut = head.slice(0, Math.max(0, head.lastIndexOf(" "))).replace(/[\s,;:–—-]+$/, "")
  // Cutting "A SUPERCALIFRAGILISTIC…" at a word would leave just "A".
  return cut.length >= 20 ? cut : chars.slice(0, 40).join("").trimEnd()
}
