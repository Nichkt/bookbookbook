/**
 * The desktop app (src-tauri/), built with `vite build --mode desktop`: the same app in a window of its own, with its
 * files on the computer. So no service worker, and no offers to install it. See README.md, "The Windows app".
 */
export const desktop = import.meta.env.MODE === "desktop"

/**
 * Work to finish before the desktop app's window closes. Closing it, src-tauri/src/lib.rs fires this event with a list
 * for promises, and closes once they've settled, or after ten seconds. Returns a function that stops it.
 */
export function beforeClosing(work: () => Promise<unknown>): () => void {
  const onClosing = (event: Event) => {
    if (event instanceof CustomEvent && Array.isArray(event.detail)) event.detail.push(work())
  }
  window.addEventListener("bookbookbook:closing", onClosing)
  return () => window.removeEventListener("bookbookbook:closing", onClosing)
}

/** The longest the app waits for that work, as when its window closes (CLOSING_WAIT in src-tauri/src/lib.rs). */
const CLOSING_WAIT_MS = 10_000

/** Does the work beforeClosing asks for, as closing the window would, for the app to end another way: to update. */
export async function finishClosingWork(): Promise<void> {
  const work: Promise<unknown>[] = []
  window.dispatchEvent(new CustomEvent("bookbookbook:closing", { detail: work }))
  let timer: ReturnType<typeof setTimeout> | undefined
  const waited = new Promise((resolve) => (timer = setTimeout(resolve, CLOSING_WAIT_MS)))
  await Promise.race([Promise.allSettled(work), waited])
  clearTimeout(timer)
}
