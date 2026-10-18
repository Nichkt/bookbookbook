import type { BookVisit } from "@/app/books"
import { daysBetween } from "@/backup/record"
import type { LibraryRow } from "@/db/queries"

/** Where a book's card leads: the screen it was last open on, else Write once it has words, else Plan. */
export function bookPath(book: Pick<LibraryRow, "id" | "words">, visit: BookVisit | undefined): string {
  return `/b/${book.id}/${visit?.screen ?? (book.words > 0 ? "write" : "plan")}`
}

/** The books, the most recently opened first; books never opened here go by when they were made. */
export function libraryOrder<T extends Pick<LibraryRow, "id" | "title" | "created_at">>(
  books: readonly T[],
  visits: Readonly<Record<string, BookVisit>>,
): T[] {
  const when = (book: T) => visits[book.id]?.at ?? book.created_at ?? ""
  return [...books].sort(
    (a, b) => when(b).localeCompare(when(a)) || (a.title ?? "").localeCompare(b.title ?? "") || a.id.localeCompare(b.id),
  )
}

/** "Opened today", "Opened yesterday", "Opened 12 days ago", "Opened 3 Mar", or "Not opened yet". */
export function openedLabel(at: string | undefined, now: Date, locale?: string): string {
  if (!at) return "Not opened yet"
  const date = new Date(at)
  const days = daysBetween(date, now)
  if (days <= 0) return "Opened today"
  if (days === 1) return "Opened yesterday"
  if (days < 30) return `Opened ${days} days ago`
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  return `Opened ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year }).format(date)}`
}
