import { useQuery } from "@powersync/react"
import { useParams } from "react-router"
import { BOOKS_SQL, type BookListRow } from "@/db/queries"

const LAST_BOOK_KEY = "bbb.lastBook"
const VISITS_KEY = "bbb.bookVisits"

/** The screens a book reopens on. */
export type BookScreen = "plan" | "write" | "world"

const BOOK_SCREENS: readonly string[] = ["plan", "write", "world"] satisfies BookScreen[]

export interface BookVisit {
  /** The screen the book was last open on. */
  screen: BookScreen
  /** When, as an ISO string. */
  at: string
}

/**
 * Marks the book as the one open. A screen passes its name too, so the home screen can list the book as just opened
 * and reopen it there.
 */
export function rememberBook(bookId: string, screen?: BookScreen, now = new Date()) {
  try {
    localStorage.setItem(LAST_BOOK_KEY, bookId)
    if (!screen) return
    const visits = { ...bookVisits(), [bookId]: { screen, at: now.toISOString() } }
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits))
  } catch {
    // Storage can be blocked; this is only a convenience.
  }
}

/** When each book was last open on this device, and on which screen. */
export function bookVisits(): Record<string, BookVisit> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(VISITS_KEY) ?? "{}")
    if (!stored || typeof stored !== "object") return {}
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, BookVisit] => isVisit(entry[1])))
  } catch {
    return {}
  }
}

function isVisit(value: unknown): value is BookVisit {
  if (!value || typeof value !== "object") return false
  const { screen, at } = value as Record<string, unknown>
  return typeof screen === "string" && BOOK_SCREENS.includes(screen) && typeof at === "string" && !isNaN(Date.parse(at))
}

function lastBook(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY)
  } catch {
    return null
  }
}

export function useBooks() {
  return useQuery<BookListRow>(BOOKS_SQL)
}

/**
 * The book the screen is about: the one in the URL, else the last one opened, else the first. Screens outside
 * `/b/:bookId` (the IME lab) use it for their links and world.
 */
export function useCurrentBook(): { book: BookListRow | undefined; books: BookListRow[]; isLoading: boolean } {
  const { bookId } = useParams()
  const { data, isLoading } = useBooks()
  const wanted = bookId ?? lastBook()
  const book = data.find((row) => row.id === wanted) ?? (bookId ? undefined : data[0])
  return { book, books: data, isLoading }
}
