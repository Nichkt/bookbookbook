import { useQuery } from "@powersync/react"
import { useMemo } from "react"
import { chapterTitle } from "@/features/plan/status"
import { isCapitalized, looksLikeName, tidyName } from "@/features/write/addToWorld"

/*
 * The Inbox (DESIGN.md §4, §10): quick notes, typed or dictated, kept until they're filed into the book. Filing puts a
 * note's text in a chapter or a World entry and moves the note to Filed, saying where it went.
 */

export interface InboxNoteRow {
  id: string
  book_id: string | null
  text: string | null
  source: string | null
  stt_engine: string | null
  filed_to: string | null
  created_at: string | null
}

/** Newest first. */
export const INBOX_NOTES_SQL = "SELECT * FROM inbox_notes WHERE book_id = ? ORDER BY created_at DESC, id DESC"

/** How a note went into a chapter: added to its notes, as moments (one per line), or to its summary. */
export type FileAs = "notes" | "moments" | "summary"
export const FILE_AS: readonly FileAs[] = ["notes", "moments", "summary"]

export type FiledTo =
  | { kind: "chapter"; id: string; as: FileAs; at: string }
  /** Added to an entry's notes, or made into a new entry. */
  | { kind: "entry"; id: string; as: "notes" | "new"; at: string }

/** Where the File dialog puts a note. */
export type FileTarget = { kind: "chapter"; id: string; as: FileAs } | { kind: "entry"; id: string }

/** Typed, or dictated: `voice-live` in the table, as DESIGN.md §5 has it. */
export type NoteSource = "typed" | "voice-live"

export interface InboxNote {
  id: string
  text: string
  source: NoteSource
  /** Which speech engine heard it (engine.ts `SttEngine`), for a dictated note. */
  sttEngine: string | null
  filedTo: FiledTo | null
  createdAt: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A note's `filed_to`, or null for one still to sort, or one whose record makes no sense. */
export function parseFiledTo(raw: string | null | undefined): FiledTo | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null
  const at = typeof value.at === "string" ? value.at : ""
  if (value.kind === "chapter") {
    const as = FILE_AS.find((option) => option === value.as) ?? "notes"
    return { kind: "chapter", id: value.id, as, at }
  }
  if (value.kind === "entry") return { kind: "entry", id: value.id, as: value.as === "new" ? "new" : "notes", at }
  return null
}

export function toInboxNote(row: InboxNoteRow): InboxNote {
  return {
    id: row.id,
    text: row.text ?? "",
    source: row.source === "voice-live" ? "voice-live" : "typed",
    sttEngine: row.stt_engine,
    filedTo: parseFiledTo(row.filed_to),
    createdAt: row.created_at ?? "",
  }
}

export interface Inbox {
  /** Still to sort, newest first. */
  toSort: InboxNote[]
  /** Filed, the most recently filed first. */
  filed: InboxNote[]
}

export function buildInbox(rows: readonly InboxNoteRow[]): Inbox {
  const notes = rows.map(toInboxNote)
  const filed = notes.filter((note) => note.filedTo)
  filed.sort((a, b) => (b.filedTo?.at ?? "").localeCompare(a.filedTo?.at ?? ""))
  return { toSort: notes.filter((note) => !note.filedTo), filed }
}

export function useInbox(bookId: string): Inbox & { isLoading: boolean } {
  const { data, isLoading } = useQuery<InboxNoteRow>(INBOX_NOTES_SQL, [bookId])
  const inbox = useMemo(() => buildInbox(data), [data])
  return { ...inbox, isLoading }
}

const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s+/u

/** A note as moments: one per line, without list bullets or numbers, blank lines skipped. */
export const momentsFrom = (text: string): string[] =>
  text
    .split(/\r\n?|\n/u)
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean)

/** Text added after what's there, a blank line between. */
export function appendText(existing: string | null | undefined, addition: string): string {
  return [(existing ?? "").trimEnd(), addition.trim()].filter(Boolean).join("\n\n")
}

/** The first line of a note, shortened and without a list bullet: for toasts, and a note's name for screen readers. */
export function notePreview(text: string, length = 60): string {
  const line = momentsFrom(text)[0] ?? ""
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line
}

/**
 * Where a note went, as its Filed line and the Undo toast say: `name` is the chapter's ("Chapter 3: The Ferry") or
 * the entry's, or null if it's since been deleted.
 */
export function filingText(filedTo: FiledTo, name: string | null): string {
  if (filedTo.kind === "chapter") {
    if (name === null) return "Filed in a chapter that's since been deleted."
    if (filedTo.as === "moments") return `Added as moments to ${name}.`
    return `Added to the ${filedTo.as} of ${name}.`
  }
  if (name === null) return "Filed in a World entry that's since been deleted."
  return filedTo.as === "new" ? `Made into “${name}” in the World.` : `Added to the notes of “${name}” in the World.`
}

/** What filingText names: the book's chapters and World entries. */
export interface Places {
  chapterById: ReadonlyMap<string, { number: number; title: string | null }>
  entryById: ReadonlyMap<string, { name: string }>
}

/** The chapter ("Chapter 3: The Ferry") or World entry a note went to, or null once it's been deleted. */
export function filedPlace(filedTo: Pick<FiledTo, "kind" | "id">, places: Places): string | null {
  if (filedTo.kind === "entry") return places.entryById.get(filedTo.id)?.name ?? null
  const chapter = places.chapterById.get(filedTo.id)
  return chapter ? `Chapter ${chapter.number}: ${chapterTitle(chapter.title)}` : null
}

/** When a note was made: "3:42 PM" today, "Yesterday", "Mar 3", or "Mar 3, 2024" in another year. */
export function noteWhen(iso: string, now = new Date(), locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year })
}

const SMALL_WORDS = new Set([
  ...["a", "an", "and", "at", "in", "of", "the"],
  ...["da", "de", "del", "der", "di", "du", "la", "le"],
])
const NAME_ENDS = /\s+[—–-]\s+|:\s+/u

/** Each word starts with a capital, bar small ones after the first: "Order of the Grey Lantern", not "Fix the boat". */
const titleCased = (name: string) =>
  name.split(" ").every((word, index) => isCapitalized(word) || (index > 0 && SMALL_WORDS.has(word.toLowerCase())))

/**
 * A note as a new World entry. A first line that's a name, or starts with one before a dash or colon ("Ilse Varga —
 * the harbourmaster"), gives the name, and the rest the notes. Otherwise the name's left to the writer.
 */
export function worldIdea(text: string): { name: string; notes: string } {
  const trimmed = text.trim()
  const [first = "", ...rest] = trimmed.split(/\r\n?|\n/u)
  const end = NAME_ENDS.exec(first)
  const name = tidyName(end ? first.slice(0, end.index) : first)
  if (!looksLikeName(name) || !titleCased(name)) return { name: "", notes: trimmed }
  const after = end ? first.slice(end.index + end[0].length) : ""
  return { name, notes: [after, ...rest].join("\n").trim() }
}
