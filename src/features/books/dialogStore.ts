import { create } from "zustand"

export type BookDialog = "new" | "settings" | "trash" | "export" | "restore"

interface BookDialogState {
  dialog: BookDialog | null
  /** What to focus when the dialog closes: the control that opened it. */
  returnFocus: HTMLElement | null
  /** Set while the dialog does something that mustn't be cut short, like a restore: it can't close till done. */
  busy: boolean
}

/** Which book dialog is open. The header menu and the empty library both open them. */
export const useBookDialogs = create<BookDialogState>(() => ({ dialog: null, returnFocus: null, busy: false }))

export const openBookDialog = (dialog: BookDialog, returnFocus: HTMLElement | null) =>
  useBookDialogs.setState({ dialog, returnFocus })

export const closeBookDialog = () => useBookDialogs.setState({ dialog: null })

export const setBookDialogBusy = (busy: boolean) => useBookDialogs.setState({ busy })

/** For a dialog's onCloseAutoFocus: puts focus back on the opener while it's still on the page. */
export function returnFocusOnClose(event: Event) {
  const target = useBookDialogs.getState().returnFocus
  if (!target?.isConnected) return
  event.preventDefault()
  target.focus()
}
