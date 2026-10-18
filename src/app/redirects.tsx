import { Navigate, useLocation, useParams } from "react-router"
import { bookVisits, useCurrentBook } from "./books"

/** `/b/:bookId` opens the book on the screen it was last open on. */
export function BookIndex() {
  const { bookId = "" } = useParams()
  return <Navigate to={bookVisits()[bookId]?.screen ?? "write"} replace />
}

/** World was called the Codex; its old addresses still work. */
export function CodexRedirect() {
  const { bookId = "", entryId } = useParams()
  const { search, hash } = useLocation()
  return <Navigate to={`/b/${bookId}/world${entryId ? `/${entryId}` : ""}${search}${hash}`} replace />
}

/** The Inbox moved into the book: `/inbox` goes to the last book's. */
export function InboxRedirect() {
  const { book, isLoading } = useCurrentBook()
  if (isLoading) return null
  return <Navigate to={book ? `/b/${book.id}/inbox` : "/"} replace />
}
