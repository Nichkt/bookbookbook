import { usePowerSync } from "@powersync/react"
import { BookOpenIcon } from "lucide-react"
import { useEffect } from "react"
import { Link, NavLink, Outlet, useParams } from "react-router"
import { startBackups } from "@/backup/scheduler"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { BackupBanner } from "@/features/backup/BackupBanner"
import { BookDialogs } from "@/features/books/BookDialogs"
import { BookMenu } from "@/features/books/BookMenu"
import { cn } from "@/lib/utils"
import { Announcer } from "./Announcer"
import { useCurrentBook } from "./books"
import { ThemeSwitcher } from "./ThemeSwitcher"

// Above the phone tab bar, or the screen edge from md up (--toast-bottom in index.css).
const TOAST_OFFSET = { bottom: "var(--toast-bottom)" }

interface Screen {
  to: string
  label: string
}

function screensFor(bookId: string | undefined): Screen[] {
  const book = bookId ? `/b/${bookId}` : ""
  return [
    { to: book ? `${book}/plan` : "/", label: "Plan" },
    { to: book ? `${book}/write` : "/", label: "Write" },
    { to: book ? `${book}/codex` : "/", label: "Codex" },
    { to: "/inbox", label: "Inbox" },
  ]
}

function ScreenLinks({ screens, className, linkClassName }: { screens: Screen[]; className: string; linkClassName: string }) {
  return (
    <nav aria-label="Screens" className={className}>
      {screens.map((screen) => (
        <NavLink
          key={screen.label}
          to={screen.to}
          className={({ isActive }) =>
            cn(
              "rounded-md text-sm font-medium text-ink-2 transition-colors hover:bg-accent hover:text-ink",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              linkClassName,
              isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )
          }
        >
          {screen.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell() {
  const db = usePowerSync()
  const { bookId } = useParams()
  const { book, books } = useCurrentBook()
  const screens = screensFor(book?.id)
  // Backups run whichever screen is open (DESIGN.md §12).
  useEffect(() => startBackups(db), [db])
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/95 px-4 backdrop-blur sm:gap-4">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Link
              to="/"
              aria-label="bookbookbook"
              className="flex shrink-0 items-center justify-center rounded-md font-heading text-xl font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <BookOpenIcon aria-hidden="true" className="size-5 sm:hidden" />
              <span className="hidden sm:inline">bookbookbook</span>
            </Link>
            <BookMenu book={book} books={books} />
          </div>
          <ScreenLinks
            screens={screens}
            className="hidden items-center gap-1 md:flex"
            linkClassName="flex items-center px-3 py-1.5 pointer-coarse:min-h-11"
          />
          <div className="ml-auto shrink-0">
            <ThemeSwitcher />
          </div>
        </header>
        {/* Phones get the bottom tab bar instead (DESIGN.md §16), so leave room for it. */}
        <main className="flex flex-1 flex-col pb-16 md:pb-0">
          {/* Only on the book's own screens, where it's clearly about that book. */}
          {bookId && book && <BackupBanner key={book.id} book={book} />}
          <Outlet />
        </main>
        <ScreenLinks
          screens={screens}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t bg-surface p-1.5 md:hidden"
          linkClassName="flex min-h-11 items-center justify-center"
        />
      </div>
      <BookDialogs book={book} />
      <Toaster offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
      <Announcer />
    </TooltipProvider>
  )
}
