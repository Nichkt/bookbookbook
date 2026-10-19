import type { Editor } from "@tiptap/react"
import { createContext, useContext } from "react"
import type { BookListRow } from "@/db/queries"
import type { Db } from "@/db/tx"
import type { MentionMatcher } from "@/editor/mentions"
import { chapterName } from "@/features/plan/commands"
import type { FocusItem } from "@/features/plan/planContext"
import type { Plan, PlanChapter, PlanSceneRow } from "@/features/plan/planData"

/** How much of the book the Write screen shows at once (DESIGN.md §8). */
export const WRITE_UNITS = ["scene", "chapter", "manuscript"] as const
export type WriteUnit = (typeof WRITE_UNITS)[number]
export const isWriteUnit = (value: unknown): value is WriteUnit => WRITE_UNITS.includes(value as WriteUnit)
export const UNIT_LABELS: Record<WriteUnit, string> = { scene: "Scene", chapter: "Chapter", manuscript: "Manuscript" }

/** Per book, like the Plan's view. */
export const unitPrefKey = (bookId: string) => `write.unit:${bookId}`
/** Per device: whether the navigator is open, the docked panel's page, and typewriter scrolling ("on" or "off"). */
export const NAV_PREF = "write.nav"
export const PANEL_PREF = "write.panel"
export const TYPEWRITER_PREF = "write.typewriter"

/** From here up the panel sits beside the text instead of over it. */
export const PANEL_DOCKED_QUERY = "(min-width: 80rem)"

/**
 * From here up the toolbar has room for every tool, and the navigator shows; below it, the phone bar puts most in a
 * menu.
 */
export const WIDE_WRITE_QUERY = "(min-width: 48rem)"

/** The panel's pages (DESIGN.md §8), each opened by its own button in the toolbar. */
export const PANEL_PAGES = ["plan", "codex", "find", "ai"] as const
export type PanelPage = (typeof PANEL_PAGES)[number]

/** The docked panel's page as the pref stores it. Before the Codex page, "open" meant the plan. */
export function panelFromPref(value: string | null | undefined): PanelPage | null {
  if (value === "open") return "plan"
  return PANEL_PAGES.includes(value as PanelPage) ? (value as PanelPage) : null
}

export const writePath = (bookId: string, chapterId: string, sceneId?: string | null) =>
  `/b/${bookId}/write/${chapterId}${sceneId ? `/${sceneId}` : ""}`

/** A scene's name on screen: its title, else its place in the chapter. A chapter written as one piece has none. */
export const sceneLabel = (scene: Pick<PlanSceneRow, "title" | "is_implicit">, index: number) =>
  scene.is_implicit ? "Chapter text" : scene.title?.trim() || `Scene ${index + 1}`

export function chapterOfScene(plan: Plan, sceneId: string): PlanChapter | undefined {
  return plan.chapters.find((chapter) => chapter.scenes.some((scene) => scene.id === sceneId))
}

/**
 * A scene's name in the middle of a sentence: "“Ferry wake”", "scene 2 of chapter 3", or for a chapter written as
 * one piece, the chapter's name.
 */
export function sceneNameIn(plan: Plan, sceneId: string): string {
  const chapter = chapterOfScene(plan, sceneId)
  const index = chapter?.scenes.findIndex((scene) => scene.id === sceneId) ?? -1
  if (!chapter || index === -1) return "this scene"
  const scene = chapter.scenes[index]
  if (scene.is_implicit) return chapterName(chapter)
  const title = scene.title?.trim()
  return title ? `“${title}”` : `scene ${index + 1} of chapter ${chapter.number}`
}

/** What a link within the Write screen asks of the page it opens, in the location's state. */
export interface WriteNavState {
  /** Where focus goes on arrival: the chapter's heading (after paging), or the scene's text (after picking it). */
  focus?: "heading" | "scene"
  /** Set as the manuscript's URL follows its scrolling, so nothing scrolls in response. */
  followed?: boolean
}

export const navState = (state: unknown): WriteNavState => (state && typeof state === "object" ? state : {})

export interface WriteContextValue {
  db: Db
  bookId: string
  book: BookListRow
  plan: Plan
  matcher: MentionMatcher
  /** Whether the names the matcher finds are still loading, so it can't yet tell a new name from a known one. */
  matcherLoading: boolean
  unit: WriteUnit
  setUnit: (unit: WriteUnit) => void
  focusItem: FocusItem
  navOpen: boolean
  toggleNav: () => void
  /** Whether the panel shows beside the text (wide screens) rather than as a sheet over it. */
  panelDocked: boolean
  /** The panel's page; null while it's closed. */
  panel: PanelPage | null
  /** Opens the panel at a page from the toolbar, or closes it. */
  setPanel: (page: PanelPage | null) => void
  /** The entry the Codex page shows; null for its list. */
  codexEntryId: string | null
  setCodexEntryId: (entryId: string | null) => void
  /** Opens the Codex page at an entry from a name in the text. Focus goes back to the text when the panel closes. */
  openEntryFromText: (entryId: string) => void
  /** The editor a name was in when it opened the panel; null when the toolbar opened it. */
  panelOpener: () => Editor | null
  /** Where focus goes as the panel closes: an editor, or with null where the panel was opened from. */
  setPanelOpener: (editor: Editor | null) => void
  /** Closes the panel, focus going to the editor, as when a match picked in Find and replace takes focus there. */
  closePanelTo: (editor: Editor) => void
  /** Typewriter scrolling (DESIGN.md §8 "Writing aids"), per device. */
  typewriter: boolean
  setTypewriter: (on: boolean) => void
}

export const WriteContext = createContext<WriteContextValue | null>(null)

export function useWrite(): WriteContextValue {
  const value = useContext(WriteContext)
  if (!value) throw new Error("useWrite needs a WriteContext provider")
  return value
}

/**
 * Where in the book the Write screen is. Kept apart from the rest, as it changes all the while the manuscript scrolls,
 * and only what shows it should draw again (the rest of a long book's page doesn't).
 */
export interface WritePlace {
  /** The chapter in the URL: the one shown, or in the manuscript the one in view. */
  chapterId: string
  sceneId: string | null
}

export const WritePlaceContext = createContext<WritePlace | null>(null)

export function useWritePlace(): WritePlace {
  const value = useContext(WritePlaceContext)
  if (!value) throw new Error("useWritePlace needs a WritePlaceContext provider")
  return value
}

/**
 * What the parts drawn for each chapter and scene on the page need, which hardly ever changes. Apart from the rest,
 * which changes with every saved word count: else a long book's whole page would draw again each time the writer
 * paused.
 */
export interface WriteBasics {
  db: Db
  bookId: string
  matcher: MentionMatcher
  matcherLoading: boolean
  focusItem: FocusItem
  /** The plan as it is now, for event handlers. What shows the plan takes it from useWrite, or as a prop. */
  currentPlan: () => Plan
}

export const WriteBasicsContext = createContext<WriteBasics | null>(null)

export function useWriteBasics(): WriteBasics {
  const value = useContext(WriteBasicsContext)
  if (!value) throw new Error("useWriteBasics needs a WriteBasicsContext provider")
  return value
}
