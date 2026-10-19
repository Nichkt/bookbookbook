import { createContext, useContext } from "react"
import type { BookListRow } from "@/db/queries"
import type { Db } from "@/db/tx"
import { byData } from "@/lib/focus"
import type { Display, DisplayField, PlanView, PresetName } from "./display"
import type { FilterKey, PlanFilters } from "./filters"
import type { Plan, PlanChapter } from "./planData"
import type { BookStructures } from "./useStructures"

export type ItemKind = "act" | "chapter" | "scene"

/** Moves focus to an item's main control in the current view, once it has rendered. */
export type FocusItem = (kind: ItemKind, id: string) => void

/** Where focus goes when the drawer opens: its heading (reading) or its title field (a new chapter). */
export type DrawerFocus = "heading" | "title" | "none"

export interface PlanContextValue {
  db: Db
  bookId: string
  book: BookListRow
  plan: Plan
  structures: BookStructures
  /** Whether the Board and Corkboard show the structure ribbon, for this book on this device. */
  ribbonShown: boolean
  setRibbonShown: (shown: boolean) => void
  view: PlanView
  display: Display
  setPreset: (preset: PresetName) => void
  toggleField: (field: DisplayField) => void
  filters: PlanFilters
  setFilter: (key: FilterKey, value: string | null) => void
  clearFilters: () => void
  /** Whether a chapter is shown at full strength under the current filters. */
  matches: (chapter: PlanChapter) => boolean
  filtering: boolean
  matchCount: number
  /** The chapter open in the drawer. */
  openId: string | null
  showChapter: (id: string, focus?: DrawerFocus) => void
  /**
   * Pops out a chapter just added, to fill in. It stays in the plan only if it's saved or opened to write; going back
   * leaves it out, and focus returns to `opener`, the button that added it.
   */
  showNewChapter: (id: string, opener?: HTMLElement | null) => void
  focusItem: FocusItem
}

export const PlanContext = createContext<PlanContextValue | null>(null)

export function usePlanContext(): PlanContextValue {
  const value = useContext(PlanContext)
  if (!value) throw new Error("usePlanContext needs a PlanContext provider")
  return value
}

/** What the chapter details (the drawer and its fields) need, so the Write screen can show them too. */
export interface ChapterDetailsValue {
  db: Db
  bookId: string
  plan: Plan
  structures: BookStructures
  focusItem: FocusItem
  /** The screen showing the details. Each links to the other. */
  place: "plan" | "write"
}

export const ChapterDetailsContext = createContext<ChapterDetailsValue | null>(null)

/** The Write screen provides the details' context; inside the Plan it's the Plan's own. */
export function useChapterDetails(): ChapterDetailsValue {
  const details = useContext(ChapterDetailsContext)
  const planContext = useContext(PlanContext)
  if (details) return details
  if (!planContext) throw new Error("useChapterDetails needs a ChapterDetailsContext or PlanContext provider")
  const { db, bookId, plan, structures, focusItem } = planContext
  return { db, bookId, plan, structures, focusItem, place: "plan" }
}

/**
 * The element focus goes to for an item, per view. Only the Outline has scene items; the Matrix and Timeline have no
 * act items either.
 */
export function itemSelector(view: PlanView, kind: ItemKind, id: string): string | null {
  if (view === "outline") return byData("outline-stop", `${kind}:${id}`)
  if (kind === "act") return view === "board" || view === "corkboard" ? byData("act-title", id) : null
  if (kind === "chapter") return byData("focus-chapter", id)
  return null
}
