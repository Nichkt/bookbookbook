import type { Editor } from "@tiptap/react"
import { create } from "zustand"
import { announce } from "@/app/feedback"
import { activeEditor } from "@/editor/activeEditor"
import { IS_MAC } from "@/lib/keys"

/*
 * Focus mode (DESIGN.md §8 "Writing aids"): the app's header, the navigator, the panel and most of the toolbar go,
 * and every paragraph but the one being written dims. It lasts while the Write screen is open; it isn't remembered.
 */

interface FocusModeState {
  on: boolean
}

export const useFocusMode = create<FocusModeState>(() => ({ on: false }))

export const FOCUS_KEYS = "Mod+."

/** Ctrl+. (⌘. on a Mac) switches focus mode. */
export const isFocusShortcut = (event: KeyboardEvent) =>
  (IS_MAC ? event.metaKey : event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  (event.key === "." || event.code === "Period")

/** Where the caret was on screen as focus mode switched, so the page can put it back there once the chrome moves. */
let held: { editor: Editor; pos: number; top: number } | null = null

function holdCaret() {
  held = null
  const entry = activeEditor()
  if (!entry || entry.editor.isDestroyed) return
  const { state, view } = entry.editor
  const pos = state.selection.head
  held = { editor: entry.editor, pos, top: view.coordsAtPos(pos).top }
}

/** Turns focus mode on or off; with no argument, switches it. */
export function setFocusMode(on = !useFocusMode.getState().on) {
  if (useFocusMode.getState().on === on) return
  holdCaret()
  useFocusMode.setState({ on })
  announce(on ? "Focus mode on. Press Escape to leave it." : "Focus mode off")
}

/** Leaves focus mode on Esc; returns whether it was on, and so whether Esc did anything. */
export function leaveFocusMode() {
  if (!useFocusMode.getState().on) return false
  setFocusMode(false)
  return true
}

/** Leaves focus mode without a word, as when the Write screen closes. */
export function resetFocusMode() {
  held = null
  useFocusMode.setState({ on: false })
}

/**
 * Run in a layout effect once focus mode has switched: scrolls the caret back to where it was on screen, though the
 * header and the toolbar came or went above it, and puts focus back in the text so the writer can carry on.
 */
export function settleCaret() {
  const hold = held
  held = null
  if (!hold || hold.editor.isDestroyed) return
  const { state, view } = hold.editor
  const pos = Math.min(hold.pos, state.doc.content.size)
  window.scrollBy(0, view.coordsAtPos(pos).top - hold.top)
  hold.editor.commands.focus(null, { scrollIntoView: false })
}
