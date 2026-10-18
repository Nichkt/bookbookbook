import { create } from "zustand"

/*
 * Installing the app (DESIGN.md §11). Chrome and Edge offer to install it, an offer the app holds on to until the
 * writer asks. Safari makes none, so the app gives its steps instead: Add to Home Screen on an iPhone or iPad, and
 * Add to Dock on a Mac.
 */

/** The browser's offer to install, which TypeScript's DOM types don't have. It can be used once. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

interface InstallState {
  /** The browser's offer to install, kept for when the writer asks. */
  offer: BeforeInstallPromptEvent | null
  /** Open as the installed app, or installed from this page. */
  installed: boolean
  /** The writer turned the browser's offer down on this visit. */
  declined: boolean
}

export const useInstall = create<InstallState>(() => ({ offer: null, installed: false, declined: false }))

/** How an installed app opens, as the manifest asks or a browser falls back to. Not fullscreen: a tab can be that. */
const APP_DISPLAY_MODES = ["standalone", "minimal-ui", "window-controls-overlay"]

function openAsApp() {
  // Safari on an iPhone or iPad says so its own way too.
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true
  return APP_DISPLAY_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)
}

/** Listens for the browser's offer to install, and for the app being installed. Early, as the offer can come soon. */
export function listenForInstall() {
  useInstall.setState({ installed: openAsApp() })
  window.addEventListener("beforeinstallprompt", (event) => {
    // The app offers to install where it suits it, rather than the browser with a banner of its own.
    event.preventDefault()
    useInstall.setState({ offer: event as BeforeInstallPromptEvent })
  })
  window.addEventListener("appinstalled", () => useInstall.setState({ offer: null, installed: true }))
}

let asking = false

/** Asks the browser to install the app, in its own dialog. Resolves once the writer has answered. */
export async function promptInstall() {
  const { offer } = useInstall.getState()
  if (!offer || asking) return
  asking = true
  // Should another offer come after this one, it stays.
  const spent = (state: InstallState) => (state.offer === offer ? null : state.offer)
  try {
    await offer.prompt()
    const { outcome } = await offer.userChoice
    useInstall.setState((state) =>
      outcome === "accepted" ? { offer: spent(state), installed: true } : { offer: spent(state), declined: true },
    )
  } catch (error) {
    console.error("[install] asking the browser", error)
    useInstall.setState((state) => ({ offer: spent(state) }))
  } finally {
    asking = false
  }
}

/** Safari's way to install: on an iPhone or iPad, Add to Home Screen; on a Mac, Add to Dock. */
export type AppleWay = "home-screen" | "dock"

/** Browsers for the Mac that say Safari in their user agent, but have no Add to Dock. */
const NOT_SAFARI = /\b(Chrome|Chromium|Edg|Firefox|OPR|Ddg)\//

/**
 * How to install the app on an Apple device, from the browser's user agent: Add to Home Screen on an iPhone or iPad,
 * in any browser since iOS 16.4, and Add to Dock in Safari 17 or later on a Mac. Null elsewhere.
 */
export function appleWay(userAgent: string, maxTouchPoints: number): AppleWay | null {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return "home-screen"
  if (!userAgent.includes("Macintosh")) return null
  // An iPad asks for pages as a Mac does, but has a touch screen.
  if (maxTouchPoints > 1) return "home-screen"
  const safari = /\bVersion\/(\d+)[\d.]* Safari\//.exec(userAgent)
  return safari && Number(safari[1]) >= 17 && !NOT_SAFARI.test(userAgent) ? "dock" : null
}

/** How the app can be installed: with the browser's offer, by Safari's steps, or, installed already, not at all. */
export type InstallWay = "offer" | AppleWay

/** How the app can be installed here, if it can. */
export function useInstallWay(): InstallWay | null {
  const offered = useInstall((state) => state.offer !== null)
  const installed = useInstall((state) => state.installed)
  if (installed) return null
  return offered ? "offer" : appleWay(navigator.userAgent, navigator.maxTouchPoints)
}
