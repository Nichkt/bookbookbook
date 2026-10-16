import { createContext, useContext } from "react"
import type { Plan } from "./planData"

/*
 * The Outline's keyboard model (DESIGN.md §6, §17). Each act, chapter and scene title is a "stop", and so is each
 * chapter summary while summaries are shown. ↑/↓ move between stops, Enter adds the next item, Tab and Shift+Tab
 * restructure, Alt+↑/↓ reorder, and Escape steps out to the row, from where Tab leaves the outline. One stop at a
 * time is in the page's Tab order (a roving tabindex), and none while a row has focus.
 */

export type StopKind = "act" | "chapter" | "scene" | "summary"

export const stopKey = (kind: StopKind, id: string) => `${kind}:${id}`

/** Every stop, in reading order. */
export function outlineStops(plan: Plan, withSummaries: boolean): string[] {
  const keys: string[] = []
  for (const group of plan.groups) {
    if (group.act) keys.push(stopKey("act", group.act.id))
    for (const chapter of group.chapters) {
      keys.push(stopKey("chapter", chapter.id))
      if (withSummaries) keys.push(stopKey("summary", chapter.id))
      for (const scene of chapter.explicitScenes) keys.push(stopKey("scene", scene.id))
    }
  }
  return keys
}

const SUMMARY = "summary:"

/** The row a stop sits in, keyed like the row's title. A summary belongs to its chapter's row. */
export const rowKeyOf = (key: string) =>
  key.startsWith(SUMMARY) ? stopKey("chapter", key.slice(SUMMARY.length)) : key

/** Whether ↑ (or ↓) should leave a multi-line field: only from its very start (or end). */
export function caretAtEdge(
  field: { selectionStart: number | null; selectionEnd: number | null; value: string },
  up: boolean,
): boolean {
  const { selectionStart, selectionEnd, value } = field
  if (selectionStart === null || selectionStart !== selectionEnd) return false
  return up ? selectionStart === 0 : selectionStart === value.length
}

const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/** The Ctrl or Cmd modifier, as hints show it and as the help text spells it. */
export const MOD = apple ? { key: "⌘", name: "Command" } : { key: "Ctrl", name: "Control" }

export interface OutlineNav {
  /** The stop in the page's Tab order, or null while a row has focus. */
  tabbable: string | null
  /** A stop got focus. */
  entered: (key: string) => void
  /** Focuses a stop now. False if it isn't on the page. */
  focusStop: (key: string, caret?: "start" | "end") => boolean
  /** ↑/↓: focus the stop before or after `key`. False at either end. */
  step: (key: string, delta: -1 | 1) => boolean
  /** Escape: focus the stop's row, from where Tab leaves the outline. */
  park: (key: string) => void
  rowFocused: (rowKey: string) => void
  rowBlurred: () => void
  /**
   * Runs a structural edit, unless one is still running or still placing focus: a held key mustn't stack edits on an
   * outline that hasn't caught up. False if it didn't run.
   */
  run: (work: () => Promise<unknown>) => boolean
  /** The row whose ⋯ menu is open. */
  menuFor: string | null
  setMenuFor: (rowKey: string | null) => void
  /** Shift+F10 or the menu key: the row's ⋯ menu opens instead of the browser's. */
  openMenu: (rowKey: string) => void
}

export const OutlineNavContext = createContext<OutlineNav | null>(null)

export function useOutlineNav(): OutlineNav {
  const value = useContext(OutlineNavContext)
  if (!value) throw new Error("useOutlineNav needs an OutlineNavContext provider")
  return value
}
