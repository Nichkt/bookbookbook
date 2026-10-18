let latest = 0
/** The request still waiting for its element to appear, if any. */
let waiting = 0

const GIVE_UP_MS = 2000
const HOLD_MS = 800

function focusElement(element: HTMLElement, caretToEnd: boolean) {
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: "nearest", inline: "nearest" })
  if (caretToEnd && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    // A field marked data-focus-select, like a search, has its text selected instead, for typing over.
    if (element.hasAttribute("data-focus-select")) return element.select()
    try {
      element.setSelectionRange(element.value.length, element.value.length)
    } catch {
      // Number inputs have no selection.
    }
  }
}

/**
 * Focuses the element matching `selector` as soon as it exists, which after an edit is usually a frame or two later,
 * once the live query has re-rendered. A reorder can then move the element, and moving a focused node blurs it, so
 * for a moment focus is put back whenever it falls to the page. A newer request or a pointer press cancels.
 */
export function focusSoon(selector: string) {
  const id = ++latest
  waiting = id
  const started = performance.now()
  let focusedAt = 0
  const cancel = () => {
    if (latest === id) latest++
  }
  window.addEventListener("pointerdown", cancel, { capture: true, once: true })
  const finish = () => {
    window.removeEventListener("pointerdown", cancel, { capture: true })
    if (waiting === id) waiting = 0
  }

  const tick = () => {
    if (latest !== id) return finish()
    const now = performance.now()
    const element = document.querySelector<HTMLElement>(selector)
    if (!focusedAt) {
      if (element) {
        focusElement(element, true)
        focusedAt = now
        if (waiting === id) waiting = 0
      } else if (now - started > GIVE_UP_MS) {
        return finish()
      }
    } else if (now - focusedAt > HOLD_MS) {
      return finish()
    } else if (element && (document.activeElement === null || document.activeElement === document.body)) {
      focusElement(element, false)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Whether a focusSoon request is still waiting for its element, so a dialog opening now shouldn't move focus. */
export const focusPending = () => waiting !== 0 && waiting === latest

/** Whether focus is nowhere in particular, so arriving somewhere may take it. */
export const nothingFocused = () => {
  const active = document.activeElement
  return !active || active === document.body
}

/** A selector for `[data-<name>="<value>"]`, with the value quoted safely. */
export const byData = (name: string, value: string) => `[data-${name}="${value.replace(/["\\]/g, "\\$&")}"]`

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ")

/**
 * Moves focus on to what follows `element`, or with nothing after it, to what comes before: for a notice that's going
 * with focus in it, rather than let focus drop to the top of the page.
 */
export function focusPast(element: HTMLElement) {
  const others = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (other) => !element.contains(other) && other.checkVisibility(),
  )
  const follows = (other: HTMLElement) => element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING
  const next = others.find(follows) ?? others.findLast((other) => !follows(other))
  next?.focus()
}
