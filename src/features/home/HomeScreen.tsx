import { useQuery } from "@powersync/react"
import { ArchiveIcon, ArchiveRestoreIcon, FileUpIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { bookVisits, type BookVisit } from "@/app/books"
import { desktop } from "@/app/desktop"
import { Button } from "@/components/ui/button"
import { WordProgress } from "@/components/WordProgress"
import { LIBRARY_SQL, type LibraryRow } from "@/db/queries"
import { openBookDialog, type BookDialog } from "@/features/books/dialogStore"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { InstallNotice } from "./InstallNotice"
import { bookPath, libraryOrder, openedLabel } from "./library"

const HEADING_ID = "home-heading"

/** `/`: the writer's books, to pick the one to work on, and ways to start another (DESIGN.md §4). */
export function HomeScreen() {
  const { data: books, isLoading } = useQuery<LibraryRow>(LIBRARY_SQL)
  // When the screen opened, for "Opened today" and the like.
  const [now] = useState(() => new Date())
  if (isLoading) return null

  if (books.length === 0) {
    return (
      <section className="mx-auto w-full max-w-2xl px-6 py-16">
        {/* Where the books will be, for the home screen's tour. */}
        <div data-tour="home-books">
          <h1 className="font-heading text-3xl font-semibold">No books yet</h1>
          <p className="mt-4 text-ink-2">
            Start one, import a manuscript, or restore one from a backup. A book you deleted may still be in the Trash.
          </p>
        </div>
        <LibraryActions className="mt-6" />
        <InstallNotice hasBooks={false} className="mt-10" />
      </section>
    )
  }

  const visits = bookVisits()
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 id={HEADING_ID} className="font-heading text-3xl font-semibold">
            Your books
          </h1>
          <p className="mt-1 text-ink-2">Pick the book you're working on, or start a new one.</p>
        </div>
        <LibraryActions />
      </div>
      <InstallNotice hasBooks className="mt-8" />
      <ul aria-labelledby={HEADING_ID} data-tour="home-books" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {libraryOrder(books, visits).map((book) => (
          <BookCard key={book.id} book={book} visit={visits[book.id]} now={now} />
        ))}
      </ul>
    </section>
  )
}

function LibraryActions({ className }: { className?: string }) {
  const open = (dialog: BookDialog) => (event: { currentTarget: HTMLElement }) =>
    openBookDialog(dialog, event.currentTarget)
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button data-tour="home-new" onClick={open("new")}>
        <PlusIcon />
        New book
      </Button>
      <Button variant="outline" data-tour="home-import" onClick={open("import")}>
        <FileUpIcon />
        Import a manuscript
      </Button>
      <Button variant="outline" data-tour="home-restore" onClick={open("restore")}>
        <ArchiveRestoreIcon />
        Restore from backup
      </Button>
      <Button variant="ghost" data-tour="home-backups" onClick={open("backups")}>
        <ArchiveIcon />
        Backups
      </Button>
      <Button variant="ghost" data-tour="home-trash" onClick={open("trash")}>
        <Trash2Icon />
        Trash
      </Button>
      {desktop && (
        <Button variant="ghost" data-tour="home-updates" onClick={open("updates")}>
          <RefreshCwIcon />
          Check for updates
        </Button>
      )}
    </div>
  )
}

function BookCard({ book, visit, now }: { book: LibraryRow; visit: BookVisit | undefined; now: Date }) {
  const untitled = !book.title?.trim()
  const title = book.title?.trim() || "Untitled book"
  const byline = [book.author?.trim(), book.genre?.trim()].filter(Boolean).join(" · ")
  return (
    <li className="relative flex min-h-40 flex-col rounded-xl border bg-page p-5 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="font-heading text-xl leading-snug font-semibold text-ink">
        <Link
          to={bookPath(book, visit)}
          className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          <span className={cn("line-clamp-2", untitled && "font-normal text-muted-foreground italic")}>{title}</span>
        </Link>
      </h2>
      {byline && <p className="mt-1 truncate text-sm text-muted-foreground">{byline}</p>}
      <div className="mt-auto space-y-1.5 pt-6">
        <WordProgress words={book.words} target={book.target_words} label={`${title} word count target`} />
        <p className="text-xs text-muted-foreground">
          {book.chapters === 1 ? "1 chapter" : `${formatCount(book.chapters)} chapters`} · {openedLabel(visit?.at, now)}
        </p>
      </div>
    </li>
  )
}
