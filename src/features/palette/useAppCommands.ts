import {
  AppWindowIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookAIcon,
  BookIcon,
  BookOpenTextIcon,
  BookUserIcon,
  DownloadIcon,
  FileTextIcon,
  FileUpIcon,
  InboxIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  PenLineIcon,
  PlusIcon,
  Redo2Icon,
  RefreshCwIcon,
  SettingsIcon,
  SignpostIcon,
  StickyNotePlusIcon,
  Trash2Icon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useLocation, useNavigate, type Location, type NavigateFunction } from "react-router"
import { rememberBook, type BookScreen } from "@/app/books"
import { desktop } from "@/app/desktop"
import { announce } from "@/app/feedback"
import { promptInstall, useInstallWay } from "@/app/install"
import { THEME_ICONS, THEME_LABELS, THEMES, useTheme } from "@/app/theme"
import { REDO_KEYS, UNDO_KEYS } from "@/app/undoShortcuts"
import type { BookListRow } from "@/db/queries"
import { openBookDialog } from "@/features/books/dialogStore"
import { codexPath, useCodex } from "@/features/codex/codexData"
import { typeIconOf } from "@/features/codex/typeIcons"
import { openGlossary, startTour } from "@/features/help/helpStore"
import { GLOSSARY } from "@/features/help/glossary"
import { tourForPath } from "@/features/help/tours"
import { openQuickNote } from "@/features/inbox/quickNoteStore"
import { isPlanView, PLAN_VIEWS, VIEW_LABELS } from "@/features/plan/display"
import { searchString } from "@/features/plan/filters"
import { usePlan } from "@/features/plan/planData"
import { chapterTitle } from "@/features/plan/status"
import { VIEW_ICONS } from "@/features/plan/viewIcons"
import { writePath } from "@/features/write/writeContext"
import { redo, undo, useUndoLabels } from "@/undo/undoHistory"
import type { PaletteCommand } from "./commands"
import { screenHandler } from "./paletteStore"

/*
 * The command palette's own commands (DESIGN.md §4 "Command palette"): the pages, the books and what the book menu
 * does, installing the app, or in the desktop app checking for updates, help and the theme everywhere; in a book, its
 * chapters, scenes and World entries too. The showing screen adds its own with usePaletteSource.
 */

type BookPage = BookScreen | "inbox"

const PAGES: readonly { page: BookPage; label: string; icon: LucideIcon; keywords: string[] }[] = [
  { page: "plan", label: "Plan", icon: LayoutGridIcon, keywords: ["organize", "outline", "board", "chapters"] },
  { page: "write", label: "Write", icon: PenLineIcon, keywords: ["editor", "text", "manuscript"] },
  { page: "world", label: "World", icon: BookUserIcon, keywords: ["codex", "characters", "places", "encyclopedia"] },
  { page: "inbox", label: "Inbox", icon: InboxIcon, keywords: ["notes", "ideas", "quick notes"] },
]

/** The book page showing, if one is. */
const pageOf = (pathname: string): BookPage | null =>
  (/^\/b\/[^/]+\/(plan|write|world|inbox)(?:\/|$)/.exec(pathname)?.[1] as BookPage | undefined) ?? null

const PLAN_VIEW_KEYWORDS: Record<string, string[]> = {
  board: ["cards", "acts"],
  outline: ["list", "tree"],
  corkboard: ["index cards"],
  matrix: ["grid", "table", "characters", "story points"],
  timeline: ["story time", "when", "dates"],
}

/** Everything the palette offers on every page. `book` is the book open, if one is. */
export function useAppCommands(book: BookListRow | undefined, books: readonly BookListRow[]): PaletteCommand[] {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme((state) => state.theme)
  const setTheme = useTheme((state) => state.setTheme)
  const installWay = useInstallWay()
  const undoLabel = useUndoLabels((state) => state.undo)
  const redoLabel = useUndoLabels((state) => state.redo)

  return useMemo(() => {
    const inBook = book?.id ?? null
    const page = pageOf(location.pathname)
    const tour = tourForPath(location.pathname)
    const commands: PaletteCommand[] = []

    if (inBook) {
      commands.push(
        {
          id: "app:quick-note",
          label: "Quick note…",
          group: "Actions",
          icon: StickyNotePlusIcon,
          keywords: ["inbox", "idea", "jot down", "note"],
          run: (from) => openQuickNote(from),
        },
        {
          id: "app:undo",
          label: "Undo",
          group: "Actions",
          icon: Undo2Icon,
          hint: undoLabel ?? "Nothing to undo",
          keys: UNDO_KEYS,
          keywords: ["take back", "mistake", "revert", "go back"],
          disabled: !undoLabel,
          run: () => void undo(),
        },
        {
          id: "app:redo",
          label: "Redo",
          group: "Actions",
          icon: Redo2Icon,
          hint: redoLabel ?? "Nothing to redo",
          keys: REDO_KEYS,
          keywords: ["do again", "bring back"],
          disabled: !redoLabel,
          run: () => void redo(),
        },
      )
    }

    if (location.pathname !== "/") {
      commands.push({
        id: "go:home",
        label: "All books",
        group: "Go to",
        icon: LibraryBigIcon,
        keywords: ["home", "library", "your books", "bookbookbook"],
        movesFocus: true,
        run: () => navigate("/"),
      })
    }
    if (inBook) {
      for (const { page: target, label, icon, keywords } of PAGES) {
        if (target === page) continue
        commands.push({
          id: `go:${target}`,
          label,
          group: "Go to",
          icon,
          keywords,
          movesFocus: true,
          run: () => navigate(`/b/${inBook}/${target}`),
        })
      }
      commands.push(...planViewCommands(inBook, location, navigate))
    }

    for (const row of books) {
      if (row.id === inBook) continue
      commands.push({
        id: `book:${row.id}`,
        label: row.title?.trim() || "Untitled book",
        group: "Books",
        icon: BookIcon,
        hint: "Book",
        keywords: ["book", "open", "switch"],
        searchOnly: true,
        movesFocus: true,
        run: () => {
          rememberBook(row.id)
          // Another book opens on the same page; from the home screen, where it was last open.
          navigate(page ? `/b/${row.id}/${page}` : `/b/${row.id}`)
        },
      })
    }
    commands.push(
      {
        id: "book:new",
        label: "New book…",
        group: "Books",
        icon: PlusIcon,
        keywords: ["start", "create", "begin"],
        run: (from) => openBookDialog("new", from),
      },
      {
        id: "book:import",
        label: "Import a manuscript…",
        group: "Books",
        icon: FileUpIcon,
        keywords: ["bring in", "word", "docx", "markdown", "text file", "upload"],
        run: (from) => openBookDialog("import", from),
      },
    )
    if (inBook) {
      commands.push(
        {
          id: "book:settings",
          label: "Book settings…",
          group: "Books",
          icon: SettingsIcon,
          keywords: ["title", "author", "word count target", "rename", "delete this book"],
          run: (from) => openBookDialog("settings", from),
        },
        {
          id: "book:export",
          label: "Export…",
          group: "Books",
          icon: DownloadIcon,
          keywords: ["download", "save a copy", "word", "docx", "markdown", "plain text", "manuscript", "submit"],
          run: (from) => openBookDialog("export", from),
        },
      )
    }
    commands.push(
      {
        id: "book:backups",
        label: "Backups…",
        group: "Books",
        icon: ArchiveIcon,
        keywords: ["backup folder", "keep safe", "copy", "save"],
        run: (from) => openBookDialog("backups", from),
      },
      {
        id: "book:restore",
        label: "Restore from backup…",
        group: "Books",
        icon: ArchiveRestoreIcon,
        keywords: ["bring back", "backup file", "recover"],
        run: (from) => openBookDialog("restore", from),
      },
      {
        id: "book:trash",
        label: "Trash…",
        group: "Books",
        icon: Trash2Icon,
        keywords: ["deleted books", "bring back", "undelete", "recover"],
        run: (from) => openBookDialog("trash", from),
      },
    )
    if (installWay) {
      commands.push({
        id: "app:install",
        label: "Install bookbookbook",
        group: "Books",
        icon: AppWindowIcon,
        // Safari makes no offer to install, so the glossary gives its steps.
        hint: installWay === "offer" ? undefined : "Glossary",
        keywords: ["app", "add to home screen", "add to dock", "desktop", "window", "offline"],
        run: (from) => {
          if (installWay === "offer") void promptInstall()
          else openGlossary("install", from)
        },
      })
    }
    if (desktop) {
      commands.push({
        id: "app:updates",
        label: "Check for updates…",
        group: "Books",
        icon: RefreshCwIcon,
        keywords: ["update", "new version", "upgrade", "latest", "release", "download", "github"],
        run: (from) => openBookDialog("updates", from),
      })
    }

    if (tour) {
      commands.push({
        id: "help:tour",
        label: "How to use this page",
        group: "Help",
        icon: SignpostIcon,
        keywords: ["tour", "walkthrough", "tutorial", "help", "how do i", "show me around"],
        run: (from) => startTour(tour, from),
      })
    }
    commands.push({
      id: "help:glossary",
      label: "Glossary",
      group: "Help",
      icon: BookAIcon,
      keywords: ["what words mean", "definitions", "terms", "help", "explain"],
      run: (from) => openGlossary("", from),
    })
    for (const term of GLOSSARY) {
      commands.push({
        id: `glossary:${term.id}`,
        label: term.term,
        group: "Help",
        icon: BookAIcon,
        hint: "Glossary",
        keywords: [...(term.aka ?? []), "what is", "meaning"],
        searchOnly: true,
        lesser: true,
        run: (from) => openGlossary(term.id, from),
      })
    }

    for (const name of THEMES) {
      commands.push({
        id: `theme:${name}`,
        label: `${THEME_LABELS[name]} theme`,
        group: "Appearance",
        icon: THEME_ICONS[name],
        checked: theme === name,
        keywords: ["appearance", "colors", "colours", "mode", ...(name === "dark" ? ["night"] : [])],
        run: () => {
          setTheme(name)
          announce(`${THEME_LABELS[name]} theme`)
        },
      })
    }
    return commands
  }, [book, books, location, navigate, theme, setTheme, installWay, undoLabel, redoLabel])
}

/** The Plan's views: on the Plan, the open chapter and filters stay as they were, as the toolbar's links keep them. */
function planViewCommands(bookId: string, location: Location, navigate: NavigateFunction): PaletteCommand[] {
  const shown = /^\/b\/[^/]+\/plan\/([a-z]+)/.exec(location.pathname)?.[1]
  const current = isPlanView(shown) ? shown : null
  return PLAN_VIEWS.map((view) => ({
    id: `go:plan:${view}`,
    label: `Plan: ${VIEW_LABELS[view]}`,
    group: "Go to",
    icon: VIEW_ICONS[view],
    checked: current ? current === view : undefined,
    keywords: ["view", ...(PLAN_VIEW_KEYWORDS[view] ?? [])],
    searchOnly: true,
    movesFocus: true,
    run: () => {
      const pathname = `/b/${bookId}/plan/${view}`
      if (current) navigate({ pathname, search: location.search }, { replace: true, state: location.state })
      else navigate(pathname)
    },
  }))
}

/**
 * The book's chapters, its scenes with titles, and its World entries with names, for finding by name. The showing
 * screen opens them its own way if it has one: the Plan pops a chapter out, and Write shows an entry in its panel.
 * Elsewhere a chapter or scene opens on Write, and an entry on World.
 */
export function useBookCommands(bookId: string): PaletteCommand[] {
  const navigate = useNavigate()
  const location = useLocation()
  const { plan } = usePlan(bookId)
  const codex = useCodex(bookId)

  return useMemo(() => {
    // A Plan still loading can't pop a chapter out itself yet, so the address asks it to once it has.
    const onPlan = location.pathname.startsWith(`/b/${bookId}/plan`)
    const popOut = (chapterId: string) => {
      const params = new URLSearchParams(location.search)
      params.set("chapter", chapterId)
      navigate({ pathname: location.pathname, search: searchString(params) }, { replace: true })
    }

    const commands: PaletteCommand[] = []
    for (const chapter of plan.chapters) {
      const title = chapterTitle(chapter.title)
      commands.push({
        id: `chapter:${chapter.id}`,
        label: `${chapter.number}. ${title}`,
        group: "Chapters",
        icon: BookOpenTextIcon,
        keywords: [title, `Chapter ${chapter.number}`],
        searchOnly: true,
        movesFocus: true,
        run: () => {
          const open = screenHandler("openChapter")
          if (open) open(chapter.id)
          else if (onPlan) popOut(chapter.id)
          else navigate(writePath(bookId, chapter.id), { state: { focus: "heading" } })
        },
      })
    }
    for (const chapter of plan.chapters) {
      for (const scene of chapter.explicitScenes) {
        const title = scene.title?.trim()
        if (!title) continue
        commands.push({
          id: `scene:${scene.id}`,
          label: title,
          group: "Scenes",
          icon: FileTextIcon,
          hint: `Chapter ${chapter.number}`,
          keywords: ["scene"],
          searchOnly: true,
          movesFocus: true,
          run: () => {
            const open = screenHandler("openScene")
            if (open) open(scene.id)
            else navigate(writePath(bookId, chapter.id, scene.id), { state: { focus: "scene" } })
          },
        })
      }
    }
    for (const entry of codex.entries) {
      if (!entry.named) continue
      const type = entry.typeId ? codex.typeById.get(entry.typeId) : undefined
      commands.push({
        id: `entry:${entry.id}`,
        label: entry.name,
        group: "World",
        icon: typeIconOf(type?.icon ?? null),
        hint: type?.singular ?? "No type",
        keywords: entry.aliases,
        searchOnly: true,
        movesFocus: true,
        run: () => {
          const open = screenHandler("openEntry")
          if (open) open(entry.id)
          else navigate(codexPath(bookId, entry.id))
        },
      })
    }
    return commands
  }, [bookId, navigate, location, plan.chapters, codex])
}
