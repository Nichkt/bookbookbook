/**
 * Whether a keydown belongs to an IME composition. Safari reports the Enter that ends a composition with
 * `isComposing` false, but with keyCode 229.
 */
export const isComposing = (event: KeyboardEvent) => event.isComposing || event.keyCode === 229

/** Whether shortcuts use ⌘ rather than Ctrl here. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" }

/** A shortcut written like "Mod+Shift+B" as this platform shows it: "⌘⇧B" on a Mac, "Ctrl+Shift+B" elsewhere. */
export function shortcutLabel(keys: string, mac = IS_MAC): string {
  const parts = keys.split("+").map((part) => (part.length === 1 ? part.toUpperCase() : part))
  if (mac) return parts.map((part) => MAC_SYMBOLS[part] ?? part).join("")
  return parts.map((part) => (part === "Mod" ? "Ctrl" : part)).join("+")
}

/** The same for `aria-keyshortcuts`, which names modifiers as KeyboardEvent.key does: "Control+Shift+B". */
export function ariaShortcut(keys: string, mac = IS_MAC): string {
  const names: Record<string, string> = { Mod: mac ? "Meta" : "Control", Ctrl: "Control", Alt: "Alt", Shift: "Shift" }
  return keys
    .split("+")
    .map((part) => names[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join("+")
}