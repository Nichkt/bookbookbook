import { createContext, useContext } from "react"
import type { BookListRow } from "@/db/queries"
import type { Db } from "@/db/tx"
import { byData } from "@/lib/focus"
import type { Display, DisplayField, PlanView, PresetName } from "./display"
import type { FilterKey, PlanFilters } from "./filters"
import type { Plan, PlanChapter } from "./planData"

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
  focusItem: FocusItem
}

export const PlanContext = createContext<PlanContextValue | null>(null)

export function usePlanContext(): PlanContextValue {
  const value = useContext(PlanContext)
  if (!value) throw new Error("usePlanContext needs a PlanContext provider")
  return value
}

/** The element focus goes to for an item, per view. The Board has no scene items. */
export function itemSelector(view: PlanView, kind: ItemKind, id: string): string | null {
  if (view === "outline") return byData("outline-stop", `${kind}:${id}`)
  if (kind === "act") return byData("act-title", id)
  if (kind === "chapter") return byData("focus-chapter", id)
  return null
}
