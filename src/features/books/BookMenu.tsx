import {
  ArchiveRestoreIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileUpIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { useRef } from "react"
import { useLocation, useNavigate } from "react-router"
import { rememberBook } from "@/app/books"
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
import { openBookDialog, type BookDialog } from "./dialogStore"

const SCREEN_RE = /^\/b\/[^/]+\/(plan|write|codex)\b/

/** The header's book switcher, with New book, Restore, Import, Book settings, Export and Trash (DESIGN.md §4, §13). */
export function BookMenu({ book, books }: { book: BookListRow | undefined; books: readonly BookListRow[] }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const trigger = useRef<HTMLButtonElement>(null)
  // Set when an item opens a dialog, so the closing menu doesn't pull focus back to its trigger.
  const openingDialog = useRef(false)
  const screen = SCREEN_RE.exec(pathname)?.[1] ?? "write"

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
          className="max-w-[min(16rem,40vw)] min-w-0 gap-1 px-2 font-normal text-muted-foreground hover:text-ink"
          aria-label={book ? `Book: ${book.title || "Untitled book"}` : "Books"}
        >
          <span className="truncate">{book ? book.title || "Untitled book" : "Books"}</span>
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
            <DropdownMenuSeparator />
          </>
        )}
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
        <DropdownMenuItem onSelect={() => open("trash")}>
          <Trash2Icon />
          Trash…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
