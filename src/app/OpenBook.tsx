import { PlusIcon } from "lucide-react"
import { Navigate } from "react-router"
import { Button } from "@/components/ui/button"
import { openBookDialog } from "@/features/books/dialogStore"
import { useCurrentBook } from "./books"
import { PlaceholderScreen } from "./PlaceholderScreens"

/** `/` opens the last book (DESIGN.md §4). */
export function OpenBook() {
  const { book, isLoading } = useCurrentBook()
  if (isLoading) return null
  if (!book) {
    return (
      <PlaceholderScreen title="No books yet" milestone="Library">
        <p>Start one, or restore a book from the Trash in the book menu above.</p>
        <Button className="mt-2" onClick={(event) => openBookDialog("new", event.currentTarget)}>
          <PlusIcon />
          New book
        </Button>
      </PlaceholderScreen>
    )
  }
  return <Navigate to={`/b/${book.id}/write`} replace />
}
