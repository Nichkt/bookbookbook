import { SearchIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigationType } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { BookListRow } from "@/db/queries"
import { focusBack } from "@/editor/activeEditor"
import { ariaShortcut, isComposing, shortcutLabel } from "@/lib/keys"
import { mergeCommands, searchCommands, type PaletteCommand, type PaletteSection } from "./commands"
import { closePalette, isPaletteShortcut, openPalette, PALETTE_KEYS, screenCommands, usePalette } from "./paletteStore"
import { useAppCommands, useBookCommands } from "./useAppCommands"

/** Where Ctrl+K is left alone: in another dialog or a menu, which has its own keys. */
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"]'

const focusedElement = () => {
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : null
}

const NO_COMMANDS: readonly PaletteCommand[] = []

/** The first command Enter would run: the best match. */
function firstEnabled(sections: readonly PaletteSection[]): string {
  for (const section of sections) for (const command of section.commands) if (!command.disabled) return command.id
  return ""
}

/** The header's Search button, which opens the command palette. */
export function PaletteButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="search"
      data-palette-open=""
      title={`Go to a chapter, an entry or a page, or do something · ${shortcutLabel(PALETTE_KEYS)}`}
      aria-keyshortcuts={ariaShortcut(PALETTE_KEYS)}
      // Focus stays where it was, in the text say, for the commands to work on and to go back to after.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => openPalette(focusedElement() ?? event.currentTarget)}
    >
      <SearchIcon />
      <span className="sr-only xl:not-sr-only">Search</span>
    </Button>
  )
}

/**
 * The command palette (DESIGN.md §4): Ctrl+K, or ⌘K on a Mac, from anywhere. It finds chapters, scenes, World
 * entries, pages and glossary terms by name, and does what the page's tools and menus do. A command picked runs once
 * it has closed, with focus back where it was, so a dialog it opens returns there too.
 */
export function CommandPalette({ book, books }: BookProps) {
  const open = usePalette((state) => state.open)
  const session = usePalette((state) => state.session)
  const { pathname } = useLocation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event) || isComposing(event)) return
      // Ctrl+K is the palette's throughout the app, never the browser's search.
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      if (usePalette.getState().open) return closePalette()
      // Another dialog or a menu keeps the keys it has, but the palette opens again as it fades away.
      const overlay = event.target instanceof Element ? event.target.closest(OVERLAYS) : null
      if (overlay && !overlay.hasAttribute("data-palette")) return
      openPalette(focusedElement())
    }
    // Capturing, so it's the palette's before the text or a field sees it.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  // Back or Forward in the browser goes to another page, with other commands. The app's own redirects, as from a book's
  // Plan to the view it was last on, leave it open.
  const navigationType = useNavigationType()
  useEffect(() => {
    if (navigationType === "POP" && usePalette.getState().open) closePalette()
  }, [pathname, navigationType])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closePalette()}>
      <DialogContent
        showCloseButton={false}
        data-palette=""
        className="top-3 translate-y-0 gap-0 overflow-hidden p-0 sm:top-[15vh] sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const { from, chosen } = usePalette.getState()
          usePalette.setState({ chosen: null })
          const back = from?.isConnected ? from : null
          if (back && !chosen?.movesFocus) focusBack(back)
          chosen?.run(back)
        }}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Go to a chapter, a World entry or a page, or do something. Type to search, then press Enter.
        </DialogDescription>
        <PaletteBody key={session} book={book} books={books} />
      </DialogContent>
    </Dialog>
  )
}

interface BookProps {
  /** The book open, if one is: not on the home screen. */
  book: BookListRow | undefined
  books: readonly BookListRow[]
}

/** Only on the page while the palette is, so a book's chapters and entries are read only then. */
function PaletteBody(props: BookProps) {
  if (!props.book) return <PaletteList {...props} bookCommands={NO_COMMANDS} />
  return <BookPalette {...props} book={props.book} />
}

function BookPalette(props: BookProps & { book: BookListRow }) {
  return <PaletteList {...props} bookCommands={useBookCommands(props.book.id)} />
}

function PaletteList({ book, books, bookCommands }: BookProps & { bookCommands: readonly PaletteCommand[] }) {
  const appCommands = useAppCommands(book, books)
  // The page's commands as the palette opened: they read its state, like the editor the caret was in.
  const sources = usePalette((state) => state.sources)
  const pageCommands = useMemo(() => screenCommands(sources), [sources])
  const commands = useMemo(
    () => mergeCommands(pageCommands, appCommands, bookCommands),
    [pageCommands, appCommands, bookCommands],
  )
  const [search, setSearch] = useState("")
  const sections = useMemo(() => searchCommands(commands, search), [commands, search])

  // The best match stays selected as the results change, chapters still loading say, for Enter to pick.
  const best = firstEnabled(sections)
  const [selected, setSelected] = useState(best)
  const [shownBest, setShownBest] = useState(best)
  if (best !== shownBest) {
    setShownBest(best)
    setSelected(best)
  }

  return (
    <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} label="Search">
      <CommandInput
        // For when it opens again as it fades away, which starts it afresh without the dialog's own focusing.
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder="Search chapters, World, actions…"
      />
      <CommandList className="max-h-[min(24rem,50dvh)]">
        <CommandEmpty>Nothing found for “{search.trim()}”</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.group} heading={section.group}>
            {section.commands.map((command) => (
              <PaletteItem key={command.id} command={command} />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

function PaletteItem({ command }: { command: PaletteCommand }) {
  const Icon = command.icon
  return (
    <CommandItem
      value={command.id}
      disabled={command.disabled}
      data-checked={command.checked ? "true" : undefined}
      onSelect={() => closePalette(command)}
    >
      {Icon ? <Icon aria-hidden="true" /> : <span aria-hidden="true" className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {command.checked && <span className="sr-only">, on</span>}
      {command.hint && <span className="shrink-0 text-xs text-muted-foreground">{command.hint}</span>}
      {command.keys && (
        <CommandShortcut className="pointer-coarse:hidden">{shortcutLabel(command.keys)}</CommandShortcut>
      )}
    </CommandItem>
  )
}
