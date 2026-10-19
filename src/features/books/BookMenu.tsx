import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileUpIcon,
  LibraryBigIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { useRef } from "react"
import { useLocation, useNavigate } from "react-router"
import { rememberBook } from "@/app/books"
import { desktop } from "@/app/desktop"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { BookListRow } from "@/db/queries"
import { LastBackupLabel } from "@/features/backup/BackupsDialog"
import { openBookDialog, type BookDialog } from "./dialogStore"

const SCREEN_RE = /^\/b\/[^/]+\/(plan|write|world|inbox)\b/

/**
 * The header's book switcher, with All books (the home screen), New book, Restore, Import, Book settings, Export,
 * Backups and Trash (DESIGN.md §4, §12, §13), and in the desktop app Check for updates (§11). Backups shows when the
 * open book was last backed up.
 */
export function BookMenu({ book, books }: { book: BookListRow | undefined; books: readonly BookListRow[] }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const trigger = useRef<HTMLButtonElement>(null)
  // Set when an item opens a dialog, so the closing menu doesn't pull focus back to its trigger.
  const openingDialog = useRef(false)
  const screen = SCREEN_RE.exec(pathname)?.[1] ?? "write"
  const title = book ? book.title || "Untitled book" : "Books"

  const open = (dialog: BookDialog) => {
    openingDialog.current = true
    openBookDialog(dialog, trigger.current)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="sm"
          // Gives way to the header's other controls on a narrow screen, so a long title shortens instead.
          className="max-w-[min(16rem,40vw)] min-w-0 shrink gap-1 px-2 font-normal text-muted-foreground hover:text-ink"
          aria-label={book ? `Book: ${title}` : "Books"}
          title={title}
        >
          <span className="truncate">{title}</span>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onCloseAutoFocus={(event) => {
          if (!openingDialog.current) return
          openingDialog.current = false
          event.preventDefault()
        }}
      >
        {books.length > 0 && (
          <>
            <DropdownMenuLabel>Books</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={book?.id ?? ""}
              onValueChange={(id) => {
                rememberBook(id)
                navigate(`/b/${id}/${screen}`)
              }}
            >
              {books.map((row) => (
                <DropdownMenuRadioItem key={row.id} value={row.id}>
                  <span className="truncate">{row.title || "Untitled book"}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuItem onSelect={() => navigate("/")}>
          <LibraryBigIcon />
          All books
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open("new")}>
          <PlusIcon />
          New book…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("restore")}>
          <ArchiveRestoreIcon />
          Restore from backup…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("import")}>
          <FileUpIcon />
          Import a manuscript…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!book} onSelect={() => open("settings")}>
          <SettingsIcon />
          Book settings…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!book} onSelect={() => open("export")}>
          <DownloadIcon />
          Export…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("backups")}>
          <ArchiveIcon />
          Backups…
          {book && <LastBackupLabel bookId={book.id} />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("trash")}>
          <Trash2Icon />
          Trash…
        </DropdownMenuItem>
        {desktop && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => open("updates")}>
              <RefreshCwIcon />
              Check for updates…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
