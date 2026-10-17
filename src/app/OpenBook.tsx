import { ArchiveRestoreIcon, PlusIcon } from "lucide-react"
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
        <p>Start one, or restore one from a backup. A deleted book may still be in the Trash, in the book menu above.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={(event) => openBookDialog("new", event.currentTarget)}>
            <PlusIcon />
            New book
          </Button>
          <Button variant="outline" onClick={(event) => openBookDialog("restore", event.currentTarget)}>
            <ArchiveRestoreIcon />
            Restore from backup
          </Button>
        </div>
      </PlaceholderScreen>
    )
  }
  return <Navigate to={`/b/${book.id}/write`} replace />
}
