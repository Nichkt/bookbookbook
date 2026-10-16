import { describe, expect, test } from "vitest"
import { groupChapters, keysForInsert, sortByPosition, type Positioned } from "./order"

const rows = (...positions: (string | null)[]): Positioned[] =>
  positions.map((position, i) => ({ id: `r${i}`, position }))

/** Ids in key order after placing `keys` at `index`, applying any re-keying. */
function placed(siblings: Positioned[], index: number, count = 1) {
  const { keys, rekeyed } = keysForInsert(siblings, index, count)
  const all = [
    ...siblings.map((row) => ({ id: row.id, position: rekeyed.get(row.id) ?? row.position })),
    ...keys.map((position, i) => ({ id: `new${i}`, position })),
  ]
  return { ids: sortByPosition(all).map((row) => row.id), keys, rekeyed, all }
}

describe("keysForInsert", () => {
  test("places between neighbours without touching them", () => {
    const siblings = sortByPosition(rows("a0", "a1", "a2"))
    for (const [index, expected] of [
      [0, ["new0", "r0", "r1", "r2"]],
      [1, ["r0", "new0", "r1", "r2"]],
      [3, ["r0", "r1", "r2", "new0"]],
      [99, ["r0", "r1", "r2", "new0"]],
      [-5, ["new0", "r0", "r1", "r2"]],
    ] as const) {
      const result = placed(siblings, index)
      expect(result.ids).toEqual(expected)
      expect(result.rekeyed.size).toBe(0)
    }
  })

  test("places several at once, and into an empty list", () => {
    expect(placed(rows("a0", "a1"), 1, 2).ids).toEqual(["r0", "new0", "new1", "r1"])
    expect(keysForInsert([], 0).keys).toHaveLength(1)
  })

  test("re-keys every sibling when neighbouring keys collide or are missing", () => {
    for (const [siblings, index] of [
      [rows("a1", "a1", "a1"), 1],
      [rows("a0", null, "a2"), 1],
      // Sorts last: "n" > "a".
      [rows("a0", "not a key!", "a2"), 2],
    ] as const) {
      const result = placed(sortByPosition(siblings), index)
      expect(result.rekeyed.size).toBe(3)
      expect(new Set(result.all.map((row) => row.position)).size).toBe(4)
      expect(result.ids.indexOf("new0")).toBe(index)
    }
  })

  test("leaves a bad key alone when it isn't next to the new one", () => {
    expect(placed(sortByPosition(rows("a0", "not a key!", "a2")), 1).rekeyed.size).toBe(0)
  })
})

describe("groupChapters", () => {
  const act = (id: string, position: string) => ({ id, position })
  const chapter = (id: string, actId: string | null, position: string) => ({ id, act_id: actId, position })

  test("a book without acts is one group", () => {
    expect(groupChapters([], [chapter("b", null, "a1"), chapter("a", null, "a0")])).toEqual([
      { act: null, chapters: [chapter("a", null, "a0"), chapter("b", null, "a1")] },
    ])
    expect(groupChapters([], [])).toEqual([{ act: null, chapters: [] }])
  })

  test("acts in order, empty ones included, and strays at the end", () => {
    const groups = groupChapters(
      [act("two", "a1"), act("one", "a0"), act("empty", "a2")],
      [chapter("x", "two", "a0"), chapter("y", "one", "a0"), chapter("stray", "gone", "a0")],
    )
    expect(groups.map((group) => [group.act?.id ?? null, group.chapters.map((c) => c.id)])).toEqual([
      ["one", ["y"]],
      ["two", ["x"]],
      ["empty", []],
      [null, ["stray"]],
    ])
  })
})
