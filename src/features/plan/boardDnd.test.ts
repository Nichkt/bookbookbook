import type { ClientRect } from "@dnd-kit/core"
import { describe, expect, test } from "vitest"
import {
  cloneOrder,
  groupOf,
  isGroupKey,
  landsAfter,
  moveToGroup,
  placeOf,
  sameOrder,
  type BoardOrder,
} from "./boardDnd"

const order: BoardOrder = { one: ["a", "b", "c"], two: ["d"], three: [] }

const rect = (left: number, top: number, width = 200, height = 100): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

describe("board orders", () => {
  test("cloneOrder copies every group's list", () => {
    const copy = cloneOrder(order)
    expect(copy).toEqual(order)
    copy.one.push("x")
    expect(order.one).toEqual(["a", "b", "c"])
  })

  test("sameOrder compares the groups and the ids in each, in order", () => {
    expect(sameOrder(order, cloneOrder(order))).toBe(true)
    expect(sameOrder(order, { ...order, one: ["b", "a", "c"] })).toBe(false)
    expect(sameOrder(order, { ...order, one: ["a", "b"] })).toBe(false)
    expect(sameOrder(order, { one: order.one, two: order.two })).toBe(false)
    expect(sameOrder(order, { one: order.one, two: order.two, four: [] })).toBe(false)
  })

  test("group keys and chapter ids are told apart, ignoring inherited keys", () => {
    expect(isGroupKey(order, "two")).toBe(true)
    expect(isGroupKey(order, "a")).toBe(false)
    expect(isGroupKey(order, "toString")).toBe(false)
    expect(groupOf(order, "c")).toBe("one")
    expect(groupOf(order, "three")).toBe("three")
    expect(groupOf(order, "nope")).toBeUndefined()
    expect(groupOf(order, "constructor")).toBeUndefined()
  })

  test("placeOf finds a chapter's group and index, and nothing for a group", () => {
    expect(placeOf(order, "b")).toEqual({ group: "one", index: 1 })
    expect(placeOf(order, "d")).toEqual({ group: "two", index: 0 })
    expect(placeOf(order, "two")).toBeNull()
    expect(placeOf(order, "nope")).toBeNull()
  })

  test("moveToGroup moves within and between groups, clamping the index", () => {
    expect(moveToGroup(order, "a", "one", 2)).toEqual({ one: ["b", "c", "a"], two: ["d"], three: [] })
    expect(moveToGroup(order, "c", "one", 0)).toEqual({ one: ["c", "a", "b"], two: ["d"], three: [] })
    expect(moveToGroup(order, "b", "two", 0)).toEqual({ one: ["a", "c"], two: ["b", "d"], three: [] })
    expect(moveToGroup(order, "b", "three", 5)).toEqual({ one: ["a", "c"], two: ["d"], three: ["b"] })
    expect(moveToGroup(order, "d", "one", -1)).toEqual({ one: ["d", "a", "b", "c"], two: [], three: [] })
    expect(order).toEqual({ one: ["a", "b", "c"], two: ["d"], three: [] })
  })
})

describe("landsAfter", () => {
  // A card twice as wide as it is tall.
  const over = rect(0, 0)

  test("without the dragged card's rect, it lands before", () => {
    expect(landsAfter(null, over)).toBe(false)
    expect(landsAfter(undefined, over)).toBe(false)
  })

  test("side by side, the horizontal offset decides", () => {
    expect(landsAfter(rect(120, 0), over)).toBe(true)
    expect(landsAfter(rect(-120, 0), over)).toBe(false)
  })

  test("stacked, the vertical offset decides", () => {
    expect(landsAfter(rect(0, 60), over)).toBe(true)
    expect(landsAfter(rect(0, -60), over)).toBe(false)
  })

  test("diagonally, offsets are weighed against the card's shape", () => {
    // 60px left but 40px down is most of the way to the next row: after.
    expect(landsAfter(rect(-60, 40), over)).toBe(true)
    // 70px right but 40px up is most of the way to the row above: before.
    expect(landsAfter(rect(70, -40), over)).toBe(false)
  })
})
