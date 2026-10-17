import { expect, test } from "vitest"
import { colorFor, colorName, nextColor, PALETTE } from "./palette"

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
