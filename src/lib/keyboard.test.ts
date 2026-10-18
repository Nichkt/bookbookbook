import { describe, expect, it } from "vitest"
import { KEYBOARD_MIN_HEIGHT, keyboardFrame, type ViewportBox } from "./keyboard"

const PHONE: ViewportBox = { width: 412, height: 915, offsetLeft: 0, offsetTop: 0, scale: 1 }

describe("keyboardFrame", () => {
  it("sees no keyboard when the whole window is in sight", () => {
    const frame = keyboardFrame(PHONE, 915, 915)
    expect(frame).toEqual({ open: false, height: 0, left: 0, width: 412, bottom: 915, lift: 0 })
  })

  it("finds the keyboard's top where the viewport shrinks and the window doesn't", () => {
    const frame = keyboardFrame({ ...PHONE, height: 575 }, 915, 915)
    expect(frame).toEqual({ open: true, height: 340, left: 0, width: 412, bottom: 575, lift: 340 })
  })

  it("follows the viewport as the page scrolls under the keyboard, which stays the same height", () => {
    const frame = keyboardFrame({ ...PHONE, height: 575, offsetTop: 120 }, 915, 915)
    expect(frame).toMatchObject({ open: true, height: 340, bottom: 695, lift: 220 })
  })

  it("finds a keyboard that shrinks the window too, by the window's full height", () => {
    const frame = keyboardFrame({ ...PHONE, height: 575 }, 575, 915)
    expect(frame).toEqual({ open: true, height: 340, left: 0, width: 412, bottom: 575, lift: 0 })
  })

  it("takes smaller drops for the browser's own bars", () => {
    const height = 915 - KEYBOARD_MIN_HEIGHT + 1
    expect(keyboardFrame({ ...PHONE, height }, 915, 915).open).toBe(false)
    expect(keyboardFrame({ ...PHONE, height: height - 1 }, 915, 915).open).toBe(true)
    // An address bar showing again, after scrolling had hidden it.
    expect(keyboardFrame({ ...PHONE, height: 859 }, 859, 915).open).toBe(false)
  })

  it("sees no keyboard while the page is pinched bigger", () => {
    const zoomed = { width: 206, height: 457, offsetLeft: 100, offsetTop: 300, scale: 2 }
    expect(keyboardFrame(zoomed, 915, 915)).toMatchObject({
      open: false,
      height: 0,
      left: 100,
      width: 206,
      bottom: 757,
    })
  })

  it("rounds to whole pixels and never lifts below the window's bottom", () => {
    const frame = keyboardFrame({ ...PHONE, height: 574.6, offsetTop: 0.3, offsetLeft: 0.4, width: 411.7 }, 915, 915)
    expect(frame).toEqual({ open: true, height: 340, left: 0, width: 412, bottom: 575, lift: 340 })
    expect(keyboardFrame({ ...PHONE, offsetTop: 4 }, 915, 915).lift).toBe(0)
  })
})
