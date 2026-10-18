import { create } from "zustand"

/** Quick note (DESIGN.md §4, §10): a note for the Inbox from anywhere in a book, without leaving the page. */
interface QuickNoteState {
  open: boolean
  /** Bumped each time it opens, so the composer starts afresh from its draft. */
  session: number
  /** Where focus goes back to once it closes: where it was before, in the text say. */
  returnFocus: HTMLElement | null
}

export const useQuickNote = create<QuickNoteState>(() => ({ open: false, session: 0, returnFocus: null }))

export const openQuickNote = (returnFocus: HTMLElement | null) =>
  useQuickNote.setState((state) => ({ open: true, session: state.session + 1, returnFocus }))

export const closeQuickNote = () => useQuickNote.setState({ open: false })
