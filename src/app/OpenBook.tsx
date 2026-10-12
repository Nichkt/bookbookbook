import { Navigate } from "react-router"
import { useCurrentBook } from "./books"
import { PlaceholderScreen } from "./PlaceholderScreens"

/** `/` opens the last book (DESIGN.md §4). */
export function OpenBook() {
  const { book, isLoading } = useCurrentBook()
  if (isLoading) return null
  if (!book) {
    return (
      <PlaceholderScreen title="No books yet" milestone="Library">
        <p>Creating books arrives with the planner in M1.</p>
      </PlaceholderScreen>
    )
  }
  return <Navigate to={`/b/${book.id}/write`} replace />
}
