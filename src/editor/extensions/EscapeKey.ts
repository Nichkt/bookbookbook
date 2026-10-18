import { Extension } from "@tiptap/core"

/*
 * ProseMirror takes every Esc pressed in the text, to stop the browser's own, so nothing outside the editor hears it.
 * The page says here what Esc in a scene should do instead, such as leave focus mode.
 */

let handler: (() => boolean) | null = null

/** Sets what Esc in a scene does; the handler returns whether it did anything. Returns the undo. */
export function onEditorEscape(next: () => boolean) {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

export const EscapeKey = Extension.create({
  name: "escapeKey",
  // After every other extension's keys, so a menu in the text that closes on Esc gets it first.
  priority: 1,
  addKeyboardShortcuts() {
    return { Escape: () => handler?.() ?? false }
  },
})
