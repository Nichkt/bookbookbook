import { Link, NavLink, Outlet } from "react-router"
import { cn } from "@/lib/utils"
import { useCurrentBook } from "./books"
import { ThemeSwitcher } from "./ThemeSwitcher"

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
  const { book } = useCurrentBook()
  const screens = screensFor(book?.id)
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-surface/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-baseline gap-3">
          <Link to="/" className="shrink-0 font-heading text-xl font-semibold tracking-tight">
            bookbookbook
          </Link>
          {book?.title && <span className="hidden truncate text-sm text-muted-foreground sm:inline">{book.title}</span>}
        </div>
        <ScreenLinks screens={screens} className="hidden items-center gap-1 md:flex" linkClassName="px-3 py-1.5" />
        <div className="ml-auto shrink-0">
          <ThemeSwitcher />
        </div>
      </header>
      {/* Phones get the bottom tab bar instead (DESIGN.md §16), so leave room for it. */}
      <main className="flex flex-1 flex-col pb-16 md:pb-0">
        <Outlet />
      </main>
      <ScreenLinks
        screens={screens}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-1 border-t bg-surface p-1.5 md:hidden"
        linkClassName="flex min-h-11 items-center justify-center"
      />
    </div>
  )
}
