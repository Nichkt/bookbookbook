import { useSyncExternalStore } from "react"

/*
 * Where the on-screen keyboard is, so tools can sit just above it (DESIGN.md §16). Browsers don't say. The visual
 * viewport, the part of the page in sight, shrinks as the keyboard opens over the page. Most browsers leave the
 * window its height, so what's fixed to the window's bottom ends up behind the keyboard; a few shrink the window
 * too, so its full height is taken to be the tallest it's been at its width.
 */

/** Less than this gone from the bottom is taken for the browser's own bars, like an address bar or iPad shortcuts. */
export const KEYBOARD_MIN_HEIGHT = 150

/** As `window.visualViewport` has it. */
export interface ViewportBox {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
  scale: number
}

export interface KeyboardFrame {
  /** Whether a keyboard looks to be open. Never while the page is pinched bigger, which shrinks the viewport too. */
  open: boolean
  /** How tall it looks to be: how much shorter the part of the page in sight is than the window at its fullest. */
  height: number
  /** The part of the page in sight: its left edge, from the window's, and its width. */
  left: number
  width: number
  /** Its bottom edge, from the window's top: with a keyboard open, the keyboard's top edge. */
  bottom: number
  /** How far that is above the window's bottom edge: how far what's fixed there must rise to be in sight. */
  lift: number
}

export const NO_KEYBOARD: KeyboardFrame = { open: false, height: 0, left: 0, width: 0, bottom: 0, lift: 0 }

/** The frame for `viewport`, given the window's height and its full height: the tallest it's been at this width. */
export function keyboardFrame(viewport: ViewportBox, windowHeight: number, fullHeight: number): KeyboardFrame {
  const bottom = Math.round(viewport.offsetTop + viewport.height)
  const pinched = Math.abs(viewport.scale - 1) > 0.01
  const height = pinched ? 0 : Math.max(0, Math.round(Math.max(windowHeight, fullHeight) - viewport.height))
  return {
    open: height >= KEYBOARD_MIN_HEIGHT,
    height,
    left: Math.round(viewport.offsetLeft),
    width: Math.round(viewport.width),
    bottom,
    lift: Math.max(0, Math.round(windowHeight) - bottom),
  }
}

const sameFrame = (a: KeyboardFrame, b: KeyboardFrame) =>
  a.open === b.open &&
  a.height === b.height &&
  a.left === b.left &&
  a.width === b.width &&
  a.bottom === b.bottom &&
  a.lift === b.lift

let frame = NO_KEYBOARD
let fullWidth = 0
let fullHeight = 0
let pending = 0
const listeners = new Set<() => void>()

function noteWindowSize() {
  if (window.innerWidth !== fullWidth) {
    fullWidth = window.innerWidth
    fullHeight = 0
  }
  fullHeight = Math.max(fullHeight, window.innerHeight)
}

// From the start, as a keyboard may already be open when something first asks.
if (typeof window !== "undefined") {
  noteWindowSize()
  window.addEventListener("resize", noteWindowSize, { passive: true })
}

function measure() {
  pending = 0
  noteWindowSize()
  const viewport = window.visualViewport
  const next = viewport ? keyboardFrame(viewport, window.innerHeight, fullHeight) : NO_KEYBOARD
  if (sameFrame(next, frame)) return
  frame = next
  for (const listener of listeners) listener()
}

const measureSoon = () => {
  pending ||= requestAnimationFrame(measure)
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.visualViewport?.addEventListener("resize", measureSoon)
    window.visualViewport?.addEventListener("scroll", measureSoon)
    window.addEventListener("resize", measureSoon)
  }
  listeners.add(listener)
  measure()
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.visualViewport?.removeEventListener("resize", measureSoon)
    window.visualViewport?.removeEventListener("scroll", measureSoon)
    window.removeEventListener("resize", measureSoon)
    cancelAnimationFrame(pending)
    pending = 0
    // Unwatched, it would go stale.
    frame = NO_KEYBOARD
  }
}

const currentFrame = () => frame
const noKeyboard = () => NO_KEYBOARD
const subscribeNothing = () => () => undefined

/** The keyboard's frame, kept current while `enabled`, as on a touch screen. Else always NO_KEYBOARD. */
export const useKeyboard = (enabled: boolean): KeyboardFrame =>
  useSyncExternalStore(enabled ? subscribe : subscribeNothing, enabled ? currentFrame : noKeyboard, noKeyboard)
