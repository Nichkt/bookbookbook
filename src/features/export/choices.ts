import { defaultPaper, type ManuscriptFont, type Paper } from "@/export/docx"
import type { ManuscriptFormat } from "@/export/files"
import type { ChapterHeadings } from "@/export/manuscript"

/* What the export dialog offers (DESIGN.md §13). Each book remembers the choices of its last export. */

export type ExportFormat = ManuscriptFormat | "backup"

interface Option<T extends string> {
  value: T
  label: string
}

export const FORMATS: readonly (Option<ExportFormat> & { extension: string; hint: string })[] = [
  { value: "docx", label: "Word manuscript", extension: ".docx", hint: "Standard manuscript format, for agents and editors." },
  { value: "markdown", label: "Markdown", extension: ".md", hint: "Italics and headings kept, for other writing apps." },
  { value: "text", label: "Plain text", extension: ".txt", hint: "Just the words." },
  { value: "backup", label: "Backup", extension: ".zip", hint: "The whole book, plan and all, to restore later." },
]

export const HEADINGS: readonly Option<ChapterHeadings>[] = [
  { value: "number-title", label: "Number and title" },
  { value: "number", label: "Number only" },
  { value: "title", label: "Title only" },
]

export const FONTS: readonly Option<ManuscriptFont>[] = [
  { value: "times", label: "Times New Roman" },
  { value: "courier", label: "Courier New" },
]

export const PAPERS: readonly Option<Paper>[] = [
  { value: "letter", label: "Letter" },
  { value: "a4", label: "A4" },
]

export interface ExportChoices {
  format: ExportFormat
  headings: ChapterHeadings
  font: ManuscriptFont
  paper: Paper
  /** Markdown and plain text: a zip with a file per chapter. */
  perChapter: boolean
}

export const exportPrefKey = (bookId: string) => `export.choices:${bookId}`

/** The stored value if it's one of the options, else the fallback. */
function pick<T extends string>(options: readonly Option<T>[], value: unknown, fallback: T): T {
  return options.find((option) => option.value === value)?.value ?? fallback
}

/** Reads the stored choices. Anything missing or unreadable falls back to a default, the paper to the locale's. */
export function parseChoices(raw: string | null, locale: string): ExportChoices {
  let stored: Record<string, unknown> = {}
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (typeof value === "object" && value !== null && !Array.isArray(value)) stored = value as Record<string, unknown>
  } catch {
    // Fall back to the defaults below.
  }
  return {
    format: pick(FORMATS, stored.format, "docx"),
    headings: pick(HEADINGS, stored.headings, "number-title"),
    font: pick(FONTS, stored.font, "times"),
    paper: pick(PAPERS, stored.paper, defaultPaper(locale)),
    perChapter: stored.perChapter === true,
  }
}
