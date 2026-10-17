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
/** Per device: whether the navigator, and the docked chapter plan, are open. */
export const NAV_PREF = "write.nav"
export const PANEL_PREF = "write.panel"

/** From here up the chapter plan sits beside the text instead of over it. */
export const PANEL_DOCKED_QUERY = "(min-width: 80rem)"

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
  unit: WriteUnit
  setUnit: (unit: WriteUnit) => void
  /** The chapter in the URL: the one shown, or in the manuscript the one in view. */
  chapterId: string
  sceneId: string | null
  focusItem: FocusItem
  navOpen: boolean
  toggleNav: () => void
  /** Whether the chapter plan shows beside the text (wide screens) rather than as a sheet over it. */
  panelDocked: boolean
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

export const WriteContext = createContext<WriteContextValue | null>(null)

export function useWrite(): WriteContextValue {
  const value = useContext(WriteContext)
  if (!value) throw new Error("useWrite needs a WriteContext provider")
  return value
}
