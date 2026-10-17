import { localDay } from "@/db/stats"

/*
 * What this device knows about each book's backups (DESIGN.md §12), kept in `ui_prefs` as `backup:<bookId>`: when
 * the book was last backed up, and since when it has changed. Checks compare the book's fingerprint, a hash of all
 * a backup holds, so any change counts, writing or planning, and nothing else does. The writing stats date it.
 */

export interface BackupRecord {
  /** When the book was last backed up: downloaded, written to the backup folder, or restored from a backup. */
  last: string | null
  /** The book's fingerprint as last backed up, or as first found with nothing written in it. Null if neither. */
  hash: string | null
  /** When `hash` was taken. */
  hashedAt: string
  /** The words added and removed on `hashedAt`'s day by then, so that writing later that day shows. */
  dayWords: number
  /** When the book first differed from `hash`, as near as can be told. Null while it doesn't. */
  changedAt: string | null
}

/** A day's writing in a book: words added and removed, over every device. */
export interface WritingDay {
  date: string
  words: number
}

export const recordKey = (bookId: string) => `backup:${bookId}`
export const snoozeKey = (bookId: string) => `backup.snooze:${bookId}`

/** A week of changes nobody has backed up brings the reminder. */
export const REMIND_AFTER_DAYS = 7
/** "Not now" puts the reminder off for a week, or a paused folder's for a day. */
export const SNOOZE_DAYS = 7
export const FOLDER_SNOOZE_DAYS = 1

const DAY_MS = 24 * 60 * 60 * 1000

const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))

export function parseRecord(value: string | null): BackupRecord | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (!isDate(record.hashedAt)) return null
  return {
    last: isDate(record.last) ? record.last : null,
    hash: typeof record.hash === "string" && record.hash ? record.hash : null,
    hashedAt: record.hashedAt,
    dayWords: typeof record.dayWords === "number" && Number.isFinite(record.dayWords) ? record.dayWords : 0,
    changedAt: isDate(record.changedAt) ? record.changedAt : null,
  }
}

/** Local midnight at the start of a YYYY-MM-DD day, as an ISO string. */
function startOfDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date).toISOString()
}

const wordsOn = (days: readonly WritingDay[], day: string) =>
  days.reduce((sum, row) => (row.date === day ? sum + row.words : sum), 0)

/** The earliest the book can have had writing that the record's fingerprint doesn't hold. Null if it can't. */
export function writingSince(record: BackupRecord | null, days: readonly WritingDay[]): string | null {
  const from = record ? localDay(new Date(record.hashedAt)) : null
  const written = [...new Set(days.filter((day) => day.words > 0).map((day) => day.date))].sort()
  for (const day of written) {
    if (from === null || day > from) return startOfDay(day)
    if (day === from && wordsOn(days, day) > record!.dayWords) return record!.hashedAt
  }
  return null
}

/** The record once the book is backed up with fingerprint `hash`. `at` is when the backup was made, if not now. */
export function afterBackup(hash: string, days: readonly WritingDay[], now: Date, at: Date = now): BackupRecord {
  return {
    last: at.toISOString(),
    hash,
    hashedAt: now.toISOString(),
    dayWords: wordsOn(days, localDay(now)),
    changedAt: null,
  }
}

/** The record once a check finds the book's fingerprint is `hash`. The same record if nothing new was learned. */
export function afterCheck(record: BackupRecord | null, hash: string, days: readonly WritingDay[], now: Date): BackupRecord {
  if (!record) {
    // The first look at a book. What's written in it is at risk till it's backed up. A book with nothing written
    // (the sample, an import, a new one) isn't: the import's file still has it, and the rest would be easy to redo.
    const written = writingSince(null, days)
    return {
      last: null,
      hash: written ? null : hash,
      hashedAt: now.toISOString(),
      dayWords: wordsOn(days, localDay(now)),
      changedAt: written,
    }
  }
  if (record.hash === hash) return record.changedAt ? { ...record, changedAt: null } : record
  if (record.changedAt) return record
  return { ...record, changedAt: writingSince(record, days) ?? now.toISOString() }
}

/** Whole days from one moment to another, as the calendar counts them here. */
export function daysBetween(from: Date, to: Date): number {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((midnight(to) - midnight(from)) / DAY_MS)
}

/** How folder backups stand, for the reminder: `paused` waits for permission, `stopped` for a new folder. */
export type FolderState = "off" | "on" | "paused" | "stopped"

export type Reminder = { kind: "never" } | { kind: "stale"; days: number } | { kind: "paused" } | { kind: "stopped" }

/**
 * Whether to remind the writer to back the book up. When folder backups need the writer, as soon as there's
 * something to back up; otherwise once a change has gone a week without a backup. That holds with folder backups
 * on too, so a book they somehow can't back up isn't left unguarded.
 */
export function reminderFor(
  record: BackupRecord | null,
  folder: FolderState,
  snoozedUntil: string | null,
  now: Date,
): Reminder | null {
  if (!record?.changedAt) return null
  if (snoozedUntil && now.getTime() < Date.parse(snoozedUntil)) return null
  if (folder === "paused" || folder === "stopped") return { kind: folder }
  if (now.getTime() - Date.parse(record.changedAt) < REMIND_AFTER_DAYS * DAY_MS) return null
  if (!record.last) return { kind: "never" }
  return { kind: "stale", days: Math.max(daysBetween(new Date(record.last), now), 0) }
}

/** When "Not now" lets the reminder come back. */
export function snoozeUntil(reminder: Reminder, now: Date): string {
  const days = reminder.kind === "paused" || reminder.kind === "stopped" ? FOLDER_SNOOZE_DAYS : SNOOZE_DAYS
  return new Date(now.getTime() + days * DAY_MS).toISOString()
}

/** The last backup, short, for the book menu: "Never", "Today", "Yesterday", "12 days ago", "3 Mar". */
export function lastBackupLabel(last: string | null, now: Date, locale?: string): string {
  if (!last) return "Never"
  const date = new Date(last)
  const days = daysBetween(date, now)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} days ago`
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year }).format(date)
}

/** The last backup, as a sentence: "Last backed up today at 14:32." */
export function lastBackupSentence(last: string | null, now: Date, locale?: string): string {
  if (!last) return "Never backed up."
  const date = new Date(last)
  const days = daysBetween(date, now)
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date)
  if (days <= 0) return `Last backed up today at ${time}.`
  if (days === 1) return `Last backed up yesterday at ${time}.`
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year }).format(date)
  return days < 30 ? `Last backed up ${days} days ago, on ${day}.` : `Last backed up on ${day}.`
}
