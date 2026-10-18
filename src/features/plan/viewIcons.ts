import {
  ChartNoAxesGanttIcon,
  Grid3x3Icon,
  LayoutGridIcon,
  ListTreeIcon,
  StickyNoteIcon,
  type LucideIcon,
} from "lucide-react"
import type { PlanView } from "./display"

/** Each Plan view's icon, in its toolbar and the command palette. */
export const VIEW_ICONS: Record<PlanView, LucideIcon> = {
  board: LayoutGridIcon,
  outline: ListTreeIcon,
  corkboard: StickyNoteIcon,
  matrix: Grid3x3Icon,
  timeline: ChartNoAxesGanttIcon,
}
