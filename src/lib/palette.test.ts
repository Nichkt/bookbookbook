import { expect, test } from "vitest"
import { colorFor, colorName, contrast, luminance, nextColor, PALETTE, textOn } from "./palette"

test("colorFor gives a label the same palette color whatever its case or spacing", () => {
  expect(PALETTE).toContain(colorFor("storm"))
  expect(colorFor(" Storm ")).toBe(colorFor("storm"))
})

test("nextColor picks the first unused color, else the least used", () => {
  expect(nextColor([])).toBe(PALETTE[0])
  expect(nextColor([PALETTE[0].toLowerCase(), null, "#123456"])).toBe(PALETTE[1])
  expect(nextColor([...PALETTE, ...PALETTE.slice(0, 3)])).toBe(PALETTE[3])
})

test("colorName names every palette color, ignoring case", () => {
  expect(new Set(PALETTE.map(colorName)).size).toBe(PALETTE.length)
  expect(colorName("#2a8c8c")).toBe("Teal")
  expect(colorName("#123456")).toBeNull()
  expect(colorName(null)).toBeNull()
})

test("contrast is the WCAG ratio, whichever color comes first", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21)
  expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21)
  expect(contrast("#777777", "#777777")).toBe(1)
  // axe's figure for the old white initials on amber, which it rounds down.
  expect(Math.floor(contrast("#ffffff", "#c98a2b") * 100) / 100).toBe(2.93)
  expect(luminance("teal")).toBeNull()
})

test("textOn picks the readable one of black and white, for every palette color and in between", () => {
  for (const color of PALETTE) expect(contrast(textOn(color), color), color).toBeGreaterThanOrEqual(4.5)
  expect(textOn("#2E4A7D")).toBe("#ffffff")
  expect(textOn("#C98A2B")).toBe("#000000")
  for (let gray = 0; gray < 256; gray += 5) {
    const color = `#${gray.toString(16).padStart(2, "0").repeat(3)}`
    expect(contrast(textOn(color), color), color).toBeGreaterThanOrEqual(4.5)
  }
  expect(textOn(null)).toBe("#ffffff")
  expect(textOn("rebeccapurple")).toBe("#ffffff")
})
