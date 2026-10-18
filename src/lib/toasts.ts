/** Sonner's list of toasts. */
const TOASTER = "[data-sonner-toaster]"

const inToaster = (node: EventTarget | null) => node instanceof Element && node.closest(TOASTER) !== null

/**
 * Keeps a toast's Undo usable while a dialog is open. Radix dialogs listen on the document to close on a press outside
 * them and to pull focus back inside, and toasts sit outside every dialog: a press on Undo closed the chapter pop-out
 * instead, and Alt+T, which moves focus to the toasts, was turned back. These events stop at the body, after React has
 * seen them. Escape in a toast goes back to where you were rather than closing the dialog. Returns a cleanup.
 */
export function letToastsThroughDialogs() {
  const body = document.body
  const fromToast = (event: Event) => {
    if (inToaster(event.target)) event.stopPropagation()
  }
  const intoToast = (event: FocusEvent) => {
    if (inToaster(event.relatedTarget)) event.stopPropagation()
  }
  const leaveToast = (event: KeyboardEvent) => {
    const active = document.activeElement
    if (event.key !== "Escape" || !(active instanceof HTMLElement) || !inToaster(active)) return
    event.stopPropagation()
    // Sonner puts focus back where it was before the toasts took it.
    active.blur()
  }
  body.addEventListener("pointerdown", fromToast)
  body.addEventListener("focusin", fromToast)
  body.addEventListener("focusout", intoToast)
  window.addEventListener("keydown", leaveToast, { capture: true })
  return () => {
    body.removeEventListener("pointerdown", fromToast)
    body.removeEventListener("focusin", fromToast)
    body.removeEventListener("focusout", intoToast)
    window.removeEventListener("keydown", leaveToast, { capture: true })
  }
}
