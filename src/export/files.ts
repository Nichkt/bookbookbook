import { strToU8, zipSync } from "fflate"
import type { Block } from "./blocks"
import { manuscriptDocx, type DocxOptions } from "./docx"
import { ExportError } from "./errors"
import { chapterHeading, type ChapterHeadings, type Manuscript, type ManuscriptChapter } from "./manuscript"
import { blocksToMarkdown, markdownHeading } from "./markdown"
import { blocksToText } from "./plainText"

/** A file to hand to the browser to save. */
export interface ExportFile {
  name: string
  type: string
  data: Uint8Array | string
}

export const FILE_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markdown: "text/markdown;charset=utf-8",
  text: "text/plain;charset=utf-8",
  zip: "application/zip",
} as const

export type ManuscriptFormat = "docx" | "markdown" | "text"

export interface ManuscriptOptions extends DocxOptions {
  format: ManuscriptFormat
  /** Markdown and plain text: a zip with a file per chapter rather than one file. */
  perChapter: boolean
}

export const NOTHING_TO_EXPORT = "There's nothing to export yet. Write a scene, then try again."

/** The manuscript as the file the writer asked for. */
export async function manuscriptFile(manuscript: Manuscript, options: ManuscriptOptions): Promise<ExportFile> {
  if (manuscript.chapters.length === 0) throw new ExportError(NOTHING_TO_EXPORT)
  const name = safeFilename(manuscript.title, "Untitled book")
  if (options.format === "docx") {
    return { name: `${name}.docx`, type: FILE_TYPES.docx, data: await manuscriptDocx(manuscript, options) }
  }
  const markdown = options.format === "markdown"
  if (options.perChapter) {
    const files = chapterFiles(manuscript, options.headings, markdown ? "md" : "txt")
    return { name: `${name} (${markdown ? "Markdown" : "text"}).zip`, type: FILE_TYPES.zip, data: zipFiles(files) }
  }
  return markdown
    ? { name: `${name}.md`, type: FILE_TYPES.markdown, data: markdownBook(manuscript, options.headings) }
    : { name: `${name}.txt`, type: FILE_TYPES.text, data: textBook(manuscript, options.headings) }
}

const byline = (author: string): Block[] =>
  author ? [{ type: "paragraph", inlines: [{ type: "text", text: `by ${author}`, marks: [] }] }] : []

/** The whole book as one Markdown file: the title as `#`, chapters as `##` and a scene's own headings below. */
export function markdownBook(manuscript: Manuscript, headings: ChapterHeadings): string {
  const parts = [markdownHeading(1, manuscript.title), blocksToMarkdown(byline(manuscript.author))]
  for (const chapter of manuscript.chapters) {
    parts.push(markdownHeading(2, chapterHeading(chapter, headings)), blocksToMarkdown(chapter.blocks, { headingOffset: 1 }))
  }
  return `${parts.filter(Boolean).join("\n\n")}\n`
}

/** The whole book as plain text, two blank lines before each chapter. */
export function textBook(manuscript: Manuscript, headings: ChapterHeadings): string {
  const title = [manuscript.title, ...(manuscript.author ? [`by ${manuscript.author}`] : [])].join("\n\n")
  const chapters = manuscript.chapters.map((chapter) => chapterText(chapter, headings))
  return `${[title, ...chapters].join("\n\n\n")}\n`
}

const chapterText = (chapter: ManuscriptChapter, headings: ChapterHeadings) =>
  `${chapterHeading(chapter, headings)}\n\n${blocksToText(chapter.blocks)}`

/** A file per chapter, numbered so they sort in reading order: "01 The Ferry Home.md". */
export function chapterFiles(
  manuscript: Manuscript,
  headings: ChapterHeadings,
  extension: "md" | "txt",
): { name: string; data: string }[] {
  const digits = Math.max(2, String(manuscript.chapters.length).length)
  return manuscript.chapters.map((chapter, index) => {
    const prefix = String(index + 1).padStart(digits, "0")
    const name = safeFilename(chapter.title || chapterHeading(chapter, "number"), `Chapter ${index + 1}`)
    const data =
      extension === "md"
        ? `${markdownHeading(1, chapterHeading(chapter, headings))}\n\n${blocksToMarkdown(chapter.blocks)}\n`
        : `${chapterText(chapter, headings)}\n`
    return { name: `${prefix} ${name}.${extension}`, data }
  })
}

export function zipFiles(files: readonly { name: string; data: string | Uint8Array }[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((file) => [file.name, typeof file.data === "string" ? strToU8(file.data) : file.data])))
}

const FORBIDDEN = new Set('<>:"/\\|?*')
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
const MAX_NAME = 120

/**
 * A name every system can save a file under: no characters Windows forbids or control codes, no dots or spaces at
 * either end, not a name Windows reserves, and not too long. The fallback stands in for a name with nothing left.
 */
export function safeFilename(name: string, fallback: string): string {
  const chars = Array.from(name, (char) => (char < " " || char === "\u007f" || FORBIDDEN.has(char) ? " " : char))
  let clean = chars.join("").replace(/\s+/g, " ").trim()
  clean = Array.from(clean).slice(0, MAX_NAME).join("")
  clean = clean.replace(/^[.\s]+|[.\s]+$/g, "")
  if (!clean) return fallback === "" ? "Untitled" : safeFilename(fallback, "")
  return RESERVED.test(clean) ? `_${clean}` : clean
}
