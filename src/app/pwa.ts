import { create } from "zustand"

/*
 * The service worker (DESIGN.md §11) keeps a copy of the app so it opens offline, and fetches new versions in the
 * background. A new version waits until the writer reloads, rather than reloading under them mid-sentence, or until
 * every bookbookbook tab has closed. Production builds only (vite.config.ts).
 */

interface PwaState {
  /** The app has just been saved for opening offline, the first time. */
  offlineReady: boolean
  /** A new version has downloaded and is waiting. */
  updateReady: boolean
}

export const usePwa = create<PwaState>(() => ({ offlineReady: false, updateReady: false }))

/** How often a long visit checks for a new version. Browsers also check whenever a page opens. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

let startUpdate: (() => Promise<void>) | undefined
let saveWork: () => Promise<void> = () => Promise.resolve()
let reloading: Promise<void> | undefined

/** Sets what's written before the page reloads into a new version: the edits still on their way to the database. */
export function saveBeforeReload(save: () => Promise<void>) {
  saveWork = save
}

/** Saves, then reloads, once however often it's asked. */
function reloadNow() {
  reloading ??= saveWork()
    .catch((error: unknown) => console.error("[pwa] saving before reload", error))
    .then(() => window.location.reload())
  return reloading
}

const logRegisterError = (error: unknown) => console.error("[pwa] registering the service worker", error)

/** Registers the service worker, which waits for the page to load first. Early, so even a startup error can update. */
export async function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
  try {
    const { registerSW } = await import("virtual:pwa-register")
    startUpdate = registerSW({
      onOfflineReady: () => usePwa.setState({ offlineReady: true }),
      onNeedRefresh: () => usePwa.setState({ updateReady: true }),
      // Once the new version takes over, each tab it controls reloads into it, as the old version's files are gone.
      onNeedReload: () => void reloadNow(),
      onRegisteredSW(_url, registration) {
        if (!registration) return
        setInterval(() => {
          if (navigator.onLine && !registration.installing) registration.update().catch(() => undefined)
        }, UPDATE_CHECK_MS)
      },
      onRegisterError: logRegisterError,
    })
  } catch (error) {
    logRegisterError(error)
  }
}

/** Reloads the page, into the new version if one is waiting. */
export async function reloadApp() {
  const update = usePwa.getState().updateReady ? startUpdate : undefined
  const waiting = update && (await navigator.serviceWorker.getRegistration())?.waiting
  if (!update || !waiting) return reloadNow()
  // onNeedReload only hears of the new version taking over in a tab that a version controlled when it opened, which
  // isn't so on the first visit or after a hard refresh. So this tab sees to its own reload.
  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated" || waiting.state === "redundant") void reloadNow()
  })
  return update()
}
