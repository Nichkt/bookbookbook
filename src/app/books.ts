import { useQuery } from "@powersync/react"
import { useParams } from "react-router"
import { BOOKS_SQL, type BookListRow } from "@/db/queries"

const LAST_BOOK_KEY = "bbb.lastBook"

export function rememberBook(bookId: string) {
  try {
    localStorage.setItem(LAST_BOOK_KEY, bookId)
  } catch {
    // Storage can be blocked; this is only a convenience.
  }
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
 * `/b/:bookId` (Inbox, the IME lab) use it for their links and codex.
 */
export function useCurrentBook(): { book: BookListRow | undefined; books: BookListRow[]; isLoading: boolean } {
  const { bookId } = useParams()
  const { data, isLoading } = useBooks()
  const wanted = bookId ?? lastBook()
  const book = data.find((row) => row.id === wanted) ?? (bookId ? undefined : data[0])
  return { book, books: data, isLoading }
}
