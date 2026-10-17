import { usePowerSync } from "@powersync/react"
import { Trash2Icon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { rememberBook } from "@/app/books"
import { attempt, offerUndo } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BookListRow } from "@/db/queries"
import { ExportForm } from "@/features/export/ExportForm"
import { RestoreForm } from "@/features/export/RestoreForm"
import { formatCount, parseCount } from "@/lib/numbers"
import { closeBookDialog, returnFocusOnClose, useBookDialogs } from "./dialogStore"
import { createBook, DEFAULT_BOOK_TARGET, trashBook, updateBook } from "./mutations"
import { TrashList } from "./TrashList"

const onOpenChange = (open: boolean) => {
  if (!open) closeBookDialog()
}

/** New book, Book settings, Export, Restore and Trash, opened from the header's book menu (DESIGN.md §4, §13). */
export function BookDialogs({ book }: { book: BookListRow | undefined }) {
  const dialog = useBookDialogs((state) => state.dialog)
  return (
    <>
      <Dialog open={dialog === "new"} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={returnFocusOnClose}>
          <NewBookForm />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "settings" && Boolean(book)} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={returnFocusOnClose}>{book && <BookSettingsForm book={book} />}</DialogContent>
      </Dialog>
      <Dialog open={dialog === "export" && Boolean(book)} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={returnFocusOnClose}
        >
          {book && <ExportForm book={book} />}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "restore"} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={returnFocusOnClose}>
          <RestoreForm />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "trash"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" onCloseAutoFocus={returnFocusOnClose}>
          <TrashList bookId={book?.id} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function NewBookForm() {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [target, setTarget] = useState(formatCount(DEFAULT_BOOK_TARGET))
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const created = await attempt("new book", createBook(db, { title, targetWords: parseCount(target) }))
    setBusy(false)
    if (!created) return
    rememberBook(created.bookId)
    closeBookDialog()
    navigate(`/b/${created.bookId}/plan`)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New book</DialogTitle>
        <DialogDescription>It starts with one blank chapter. Plan the rest on the Board or in the Outline.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="new-book-title">Title</Label>
        <Input
          id="new-book-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled book"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-book-target">Target length in words</Label>
        <Input
          id="new-book-target"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          Create book
        </Button>
      </DialogFooter>
    </form>
  )
}

function BookSettingsForm({ book }: { book: BookListRow }) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [title, setTitle] = useState(book.title ?? "")
  const [author, setAuthor] = useState(book.author ?? "")
  const [genre, setGenre] = useState(book.genre ?? "")
  const [target, setTarget] = useState(book.target_words ? formatCount(book.target_words) : "")
  const name = book.title?.trim() || "Untitled book"

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const patch = {
      title: title.trim() || "Untitled book",
      author: author.trim(),
      genre: genre.trim(),
      target_words: parseCount(target),
    }
    const saved = await attempt("book settings", updateBook(db, book.id, patch).then(() => true))
    if (saved) closeBookDialog()
  }

  const moveToTrash = async () => {
    const changes = await attempt("trash book", trashBook(db, book.id))
    if (!changes) return
    closeBookDialog()
    navigate("/")
    offerUndo(db, `Moved “${name}” to the Trash`, changes, () => navigate(`/b/${book.id}/plan`))
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Book settings</DialogTitle>
        <DialogDescription>{name}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="book-title">Title</Label>
        <Input id="book-title" value={title} onChange={(event) => setTitle(event.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-author">Author</Label>
        <Input
          id="book-author"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Your name, as on the title page"
          autoComplete="name"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-genre">Genre</Label>
        <Input
          id="book-genre"
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          placeholder="Literary mystery"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-target">Target length in words</Label>
        <Input
          id="book-target"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
      </div>
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void moveToTrash()}
        >
          <Trash2Icon />
          Move to Trash
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit">Save</Button>
        </div>
      </DialogFooter>
    </form>
  )
}
