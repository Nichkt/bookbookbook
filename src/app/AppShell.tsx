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
import { DictationSetupDialog } from "@/features/dictation/DictationSetupDialog"
import { ListeningPill } from "@/features/dictation/ListeningPill"
import { GlossaryDialog } from "@/features/help/GlossaryDialog"
import { HelpButtons } from "@/features/help/HelpButtons"
import { Tour } from "@/features/help/Tour"
import { QuickNoteButton, QuickNoteDialog } from "@/features/inbox/QuickNote"
import { useFocusMode } from "@/features/write/focusMode"
import { startSprintTimer } from "@/features/write/sprint"
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

function screensFor(bookId: string): Screen[] {
  const book = `/b/${bookId}`
  return [
    { to: `${book}/plan`, label: "Plan" },
    { to: `${book}/write`, label: "Write" },
    { to: `${book}/world`, label: "World" },
    { to: `${book}/inbox`, label: "Inbox" },
  ]
}

interface ScreenLinksProps {
  screens: Screen[]
  className: string
  linkClassName: string
  /** The phone's tab bar, fixed to the bottom of the screen. */
  bottom?: boolean
  hidden?: boolean
}

function ScreenLinks({ screens, className, linkClassName, bottom = false, hidden = false }: ScreenLinksProps) {
  return (
    <nav
      aria-label="Screens"
      data-sticky-bottom={bottom ? "" : undefined}
      hidden={hidden}
      className={className}
    >
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
  // A book's own screens get the book menu and the screen tabs; the home screen is about all of them.
  const inBook = Boolean(bookId)
  const screens = inBook && book ? screensFor(book.id) : null
  // Focus mode on the Write screen hides the app's chrome, kept mounted so it comes back as it was (DESIGN.md §8).
  const focusMode = useFocusMode((state) => state.on)
  // Backups run whichever screen is open (DESIGN.md §12), and so do sprints' timers (§8).
  useEffect(() => startBackups(db), [db])
  useEffect(() => startSprintTimer(db), [db])
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col" data-focus-mode={focusMode ? "" : undefined}>
        <header
          data-sticky-top=""
          hidden={focusMode}
          className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/95 px-4 backdrop-blur sm:gap-4"
        >
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Link
              to="/"
              aria-label="bookbookbook"
              title="Your books"
              className="flex shrink-0 items-center justify-center rounded-md font-heading text-xl font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <BookOpenIcon aria-hidden="true" className="size-5 sm:hidden" />
              <span className="hidden sm:inline">bookbookbook</span>
            </Link>
            {inBook && <BookMenu book={book} books={books} />}
          </div>
          {screens && (
            <ScreenLinks
              screens={screens}
              className="hidden items-center gap-1 md:flex"
              linkClassName="flex items-center px-3 py-1.5 pointer-coarse:min-h-11"
            />
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {inBook && book && <QuickNoteButton />}
            <HelpButtons />
            <ThemeSwitcher />
          </div>
        </header>
        {/* Phones get the bottom tab bar instead (DESIGN.md §16), so leave room for it. */}
        <main className={cn("flex flex-1 flex-col", screens && !focusMode && "pb-16 md:pb-0")}>
          {/* Only on the book's own screens, where it's clearly about that book. */}
          {inBook && book && (
            <div hidden={focusMode}>
              <BackupBanner key={book.id} book={book} />
            </div>
          )}
          <Outlet />
        </main>
        {screens && (
          <ScreenLinks
            screens={screens}
            bottom
            hidden={focusMode}
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t bg-surface p-1.5 md:hidden"
            linkClassName="flex min-h-11 items-center justify-center"
          />
        )}
      </div>
      {/* Outside a book (the home screen), the dialogs work on all the books rather than the last one open. */}
      <BookDialogs book={inBook ? book : undefined} />
      {inBook && book && <QuickNoteDialog key={book.id} bookId={book.id} />}
      <DictationSetupDialog />
      <ListeningPill />
      <GlossaryDialog />
      <Tour />
      <Toaster offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
      <Announcer />
    </TooltipProvider>
  )
}
