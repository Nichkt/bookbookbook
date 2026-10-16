import { create } from "zustand"

export type BookDialog = "new" | "settings" | "trash"

interface BookDialogState {
  dialog: BookDialog | null
  /** What to focus when the dialog closes: the control that opened it. */
  returnFocus: HTMLElement | null
}

/** Which book dialog is open. The header menu and the empty library both open them. */
export const useBookDialogs = create<BookDialogState>(() => ({ dialog: null, returnFocus: null }))

export const openBookDialog = (dialog: BookDialog, returnFocus: HTMLElement | null) =>
  useBookDialogs.setState({ dialog, returnFocus })

export const closeBookDialog = () => useBookDialogs.setState({ dialog: null })

/** For a dialog's onCloseAutoFocus: puts focus back on the opener while it's still on the page. */
export function returnFocusOnClose(event: Event) {
  const target = useBookDialogs.getState().returnFocus
  if (!target?.isConnected) return
  event.preventDefault()
  target.focus()
}
