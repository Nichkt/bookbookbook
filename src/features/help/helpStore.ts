import { create } from "zustand"

/** The pages with a tour (DESIGN.md §17a). */
export type TourId = "home" | "plan" | "write" | "world" | "inbox"

interface HelpState {
  /** The glossary's open term ("" for the top), or null while it's closed. */
  glossary: string | null
  glossaryReturn: HTMLElement | null
  tour: TourId | null
  tourReturn: HTMLElement | null
}

/** The glossary and the page tours, which the header and the "?" buttons beside labels open. */
export const useHelp = create<HelpState>(() => ({ glossary: null, glossaryReturn: null, tour: null, tourReturn: null }))

export const openGlossary = (term: string, returnFocus: HTMLElement | null) =>
  useHelp.setState({ glossary: term, glossaryReturn: returnFocus })

export const closeGlossary = () => useHelp.setState({ glossary: null })

export const startTour = (tour: TourId, returnFocus: HTMLElement | null) =>
  useHelp.setState({ tour, tourReturn: returnFocus, glossary: null })

export const endTour = () => useHelp.setState({ tour: null })

/** Focuses `target` if it's still on the page, for a dialog's onCloseAutoFocus. */
export function refocus(event: Event, target: HTMLElement | null) {
  if (!target?.isConnected) return
  event.preventDefault()
  target.focus()
}
