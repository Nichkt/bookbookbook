import { describe, expect, it } from "vitest"
import { ariaShortcut, shortcutLabel } from "./keys"

describe("shortcutLabel", () => {
  it("writes Ctrl and plus signs off a Mac", () => {
    expect(shortcutLabel("Mod+b", false)).toBe("Ctrl+B")
    expect(shortcutLabel("Mod+Alt+S", false)).toBe("Ctrl+Alt+S")
  })

  it("writes symbols on a Mac", () => {
    expect(shortcutLabel("Mod+Shift+B", true)).toBe("⌘⇧B")
    expect(shortcutLabel("Mod+Alt+s", true)).toBe("⌘⌥S")
  })
})

describe("ariaShortcut", () => {
  it("names modifiers as KeyboardEvent.key does", () => {
    expect(ariaShortcut("Mod+Shift+e", false)).toBe("Control+Shift+E")
    expect(ariaShortcut("Mod+i", true)).toBe("Meta+I")
  })
})
