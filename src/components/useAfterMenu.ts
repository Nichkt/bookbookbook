import { useRef } from "react"

/**
 * For menu items whose action moves focus (into the text, onto a heading) or opens a dialog: the action runs once
 * the menu has closed, in place of focus going back to the menu's button, so the two don't fight over focus.
 * Pass `onCloseAutoFocus` to the menu's content and wrap such actions in `after`.
 */
export function useAfterMenu() {
  const pending = useRef<(() => void) | null>(null)
  return {
    after: (action: () => void) => {
      pending.current = action
    },
    onCloseAutoFocus: (event: Event) => {
      const action = pending.current
      if (!action) return
      pending.current = null
      event.preventDefault()
      action()
    },
  }
}
