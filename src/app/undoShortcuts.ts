import { useEffect } from "react"
import { ariaShortcut, IS_MAC, isComposing } from "@/lib/keys"
import { redo, undo } from "@/undo/undoHistory"

export const UNDO_KEYS = "Mod+Z"
/** Ctrl+Y elsewhere, where Ctrl+Shift+Z works too. */
export const REDO_KEYS = IS_MAC ? "Mod+Shift+Z" : "Ctrl+Y"

export const REDO_ARIA = IS_MAC ? ariaShortcut(REDO_KEYS) : `${ariaShortcut(REDO_KEYS)} ${ariaShortcut("Ctrl+Shift+Z")}`

type ShortcutKeys = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">

/** Which of Undo and Redo a keydown asks for, if either. */
export function undoShortcut(event: ShortcutKeys, mac = IS_MAC): "undo" | "redo" | null {
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!mod || event.altKey) return null
  // The letter typed, so Ctrl+Y and Ctrl+Z stay themselves on a German keyboard, which swaps the two keys; the key's
  // place for other alphabets.
  const letter = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code.replace(/^Key/, "").toLowerCase()
  if (letter === "z") return event.shiftKey ? "redo" : "undo"
  if (letter === "y" && !mac && !event.shiftKey) return "redo"
  return null
}

const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"])

/** Whether Ctrl+Z belongs to what has focus: text, which undoes its own typing first. */
export function ownsUndo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type)
}

/**
 * Ctrl+Z and Ctrl+Y, or ⌘Z and ⌘⇧Z on a Mac, undo and redo the book's latest edit (DESIGN.md §12): anywhere but in
 * text, which keeps them for its own typing.
 */
export function useUndoShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const what = undoShortcut(event)
      // Bubbling, so a dialog with its own Undo has it first.
      if (!what || event.defaultPrevented || isComposing(event) || ownsUndo(event.target)) return
      event.preventDefault()
      void (what === "undo" ? undo() : redo())
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
