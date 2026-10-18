import { describe, expect, test } from "vitest"
import { pinTiers } from "./ribbonLayout"
import { findStructure } from "./structures"

describe("pinTiers", () => {
  test("pins far enough apart share the bottom tier", () => {
    expect(pinTiers([0, 0.25, 0.5, 1], 400, 24)).toEqual([0, 0, 0, 0])
  })

  test("a pin too close to the one before goes up a tier, and comes back down when there's room", () => {
    // 0.04 and 0.06 of 1,000px are 20px apart.
    expect(pinTiers([0, 0.04, 0.06, 0.1, 0.2, 0.22], 1000, 24)).toEqual([0, 0, 1, 0, 0, 1])
  })

  test("the 15-beat structure fits in two tiers on a wide screen", () => {
    const structure = findStructure("fifteen_beat")!
    const tiers = pinTiers(
      structure.beats.map((item) => item.pct / 100),
      1180,
      26,
    )
    expect(Math.max(...tiers)).toBe(1)
    expect(tiers.filter((tier) => tier === 1)).toHaveLength(3)
  })

  test("once every tier is taken, a pin goes where the last pin is furthest away", () => {
    expect(pinTiers([0, 0.01, 0.02, 0.03], 100, 24, 3)).toEqual([0, 1, 2, 0])
  })

  test("pins out of order are laid out by position", () => {
    expect(pinTiers([0.06, 0.04], 1000, 24)).toEqual([1, 0])
  })

  test("all in the bottom tier until the bar has a width", () => {
    expect(pinTiers([0, 0.01, 0.02], 0, 24)).toEqual([0, 0, 0])
  })
})
