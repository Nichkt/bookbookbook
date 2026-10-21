import { expect, test, vi } from "vitest"
import { undoShortcut } from "./undoShortcuts"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }) }))

type Mods = { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }

const key = (key: string, code: string, mods: Mods = {}) => ({
  key,
  code,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
})

test("Ctrl+Z undoes, and Ctrl+Y or Ctrl+Shift+Z redo, off a Mac", () => {
  expect(undoShortcut(key("z", "KeyZ", { ctrl: true }), false)).toBe("undo")
  expect(undoShortcut(key("Z", "KeyZ", { ctrl: true, shift: true }), false)).toBe("redo")
  expect(undoShortcut(key("y", "KeyY", { ctrl: true }), false)).toBe("redo")
  expect(undoShortcut(key("Y", "KeyY", { ctrl: true, shift: true }), false)).toBeNull()
  expect(undoShortcut(key("z", "KeyZ", { meta: true }), false)).toBeNull()
  expect(undoShortcut(key("z", "KeyZ", { ctrl: true, meta: true }), false)).toBeNull()
  // AltGr comes as Ctrl+Alt.
  expect(undoShortcut(key("z", "KeyZ", { ctrl: true, alt: true }), false)).toBeNull()
  expect(undoShortcut(key("z", "KeyZ"), false)).toBeNull()
})

test("⌘Z undoes and ⌘⇧Z redoes on a Mac", () => {
  expect(undoShortcut(key("z", "KeyZ", { meta: true }), true)).toBe("undo")
  expect(undoShortcut(key("z", "KeyZ", { meta: true, shift: true }), true)).toBe("redo")
  expect(undoShortcut(key("y", "KeyY", { meta: true }), true)).toBeNull()
  expect(undoShortcut(key("z", "KeyZ", { ctrl: true }), true)).toBeNull()
})

test("goes by the letter typed, or by the key's place for other alphabets", () => {
  // A German keyboard swaps Y and Z.
  expect(undoShortcut(key("z", "KeyY", { ctrl: true }), false)).toBe("undo")
  expect(undoShortcut(key("y", "KeyZ", { ctrl: true }), false)).toBe("redo")
  expect(undoShortcut(key("я", "KeyZ", { ctrl: true }), false)).toBe("undo")
  expect(undoShortcut(key("н", "KeyY", { ctrl: true }), false)).toBe("redo")
})
