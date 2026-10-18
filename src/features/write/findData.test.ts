import { describe, expect, test } from "vitest"
import { compileFind } from "@/editor/find"
import { chapterOf, planOf } from "@/test/plan"
import {
  bookResults,
  findInBook,
  findStatus,
  groupResults,
  indexOfTarget,
  namesScenes,
  sceneOrder,
  seedQuery,
  stepIndex,
  type BookMatch,
  type BookResults,
} from "./findData"

const plan = planOf({
  loose: [
    { title: "One", scenes: [{ title: "Dock" }, { title: "Ferry" }] },
    { title: "Two", scenes: [{ implicit: true }] },
  ],
})

const texts = new Map([
  ["sc-One-1", ["Mara ran.", "Then Mara stopped."]],
  ["sc-One-2", ["No one here."]],
  ["sc-Two-1", ["mara again"]],
])

const mara = compileFind({ query: "mara", matchCase: false, wholeWord: false, pattern: false })!.regex!

const brief = (matches: readonly BookMatch[]) =>
  matches.map(({ sceneId, ordinal, start, end }) => `${sceneId}#${ordinal}@${start}-${end}`)

describe("findInBook", () => {
  test("finds matches in reading order, numbered within each scene across its runs", () => {
    const results = findInBook(plan, texts, mara)
    expect(brief(results.matches)).toEqual(["sc-One-1#0@0-4", "sc-One-1#1@5-9", "sc-Two-1#0@0-4"])
    expect(results.matches[1]).toMatchObject({ chapterId: "ch-One", text: "Then Mara stopped." })
    expect(results).toMatchObject({ capped: false, partial: false })
  })

  test("says when some scenes aren't read yet", () => {
    const some = new Map([...texts].filter(([id]) => id !== "sc-One-2"))
    const results = findInBook(plan, some, mara)
    expect(results.partial).toBe(true)
    expect(results.matches).toHaveLength(3)
  })

  test("stops at the limit and says there are more", () => {
    expect(findInBook(plan, texts, mara, 3)).toMatchObject({ capped: false })
    const capped = findInBook(plan, texts, mara, 2)
    expect(capped.capped).toBe(true)
    expect(brief(capped.matches)).toEqual(["sc-One-1#0@0-4", "sc-One-1#1@5-9"])
  })

  test("bookResults searches again only when something changes", () => {
    const first = bookResults(plan, texts, mara)
    expect(bookResults(plan, texts, mara)).toBe(first)
    expect(bookResults(plan, new Map(texts), mara)).not.toBe(first)
  })
})

describe("stepIndex", () => {
  const { matches } = findInBook(plan, texts, mara)
  const order = sceneOrder(plan)
  const step = (current: [string, number] | null, place: [string, number] | null, by: 1 | -1) =>
    stepIndex(
      matches,
      order,
      current && { sceneId: current[0], ordinal: current[1] },
      place && { sceneId: place[0], ordinal: place[1] },
      by,
    )

  test("orders scenes as the book reads", () => {
    expect([...order]).toEqual([
      ["sc-One-1", 0],
      ["sc-One-2", 1],
      ["sc-Two-1", 2],
    ])
  })

  test("moves on from the current match, round the book and back", () => {
    expect(step(["sc-One-1", 0], null, 1)).toBe(1)
    expect(step(["sc-One-1", 0], null, -1)).toBe(2)
    expect(step(["sc-Two-1", 0], null, 1)).toBe(0)
    expect(step(["sc-Two-1", 0], null, -1)).toBe(1)
  })

  test("goes from a place in the text when no match is current", () => {
    // Between the first two matches.
    expect(step(null, ["sc-One-1", 1], 1)).toBe(1)
    expect(step(null, ["sc-One-1", 1], -1)).toBe(0)
    // In a scene with no matches.
    expect(step(null, ["sc-One-2", 0], 1)).toBe(2)
    expect(step(null, ["sc-One-2", 0], -1)).toBe(1)
    // Before the first.
    expect(step(null, ["sc-One-1", 0], -1)).toBe(2)
  })

  test("treats a current match that's gone as a place", () => {
    expect(step(["sc-One-1", 5], null, 1)).toBe(2)
    expect(step(["sc-One-1", 5], null, -1)).toBe(1)
  })

  test("starts at either end with nowhere to go from, and finds nothing in nothing", () => {
    expect(step(null, null, 1)).toBe(0)
    expect(step(null, null, -1)).toBe(2)
    expect(stepIndex([], order, null, null, 1)).toBe(-1)
  })

  test("indexOfTarget finds a match by scene and ordinal", () => {
    expect(indexOfTarget(matches, { sceneId: "sc-One-1", ordinal: 1 })).toBe(1)
    expect(indexOfTarget(matches, { sceneId: "sc-One-2", ordinal: 0 })).toBe(-1)
    expect(indexOfTarget(matches, null)).toBe(-1)
  })
})

describe("groupResults", () => {
  const { matches } = findInBook(plan, texts, mara)

  test("groups matches by chapter and scene", () => {
    const groups = groupResults(plan, matches)
    expect(groups.map((group) => [group.chapter.id, group.count])).toEqual([
      ["ch-One", 2],
      ["ch-Two", 1],
    ])
    expect(groups[0].scenes.map((scene) => [scene.scene.id, scene.index, brief(scene.matches)])).toEqual([
      ["sc-One-1", 0, ["sc-One-1#0@0-4", "sc-One-1#1@5-9"]],
    ])
  })

  test("lists only the first matches but counts them all", () => {
    const groups = groupResults(plan, matches, 1)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
    expect(brief(groups[0].scenes[0].matches)).toEqual(["sc-One-1#0@0-4"])
  })

  test("names scenes only in chapters the writer split into scenes", () => {
    expect(namesScenes(chapterOf(plan, "One"))).toBe(true)
    expect(namesScenes(chapterOf(plan, "Two"))).toBe(false)
  })
})

describe("findStatus", () => {
  const { matches } = findInBook(plan, texts, mara)
  const results = (over: Partial<BookResults>): BookResults => ({ matches, capped: false, partial: false, ...over })

  test("says how many matches there are, and where", () => {
    expect(findStatus(results({}), -1)).toBe("3 matches in 2 chapters")
    expect(findStatus(results({ matches: matches.slice(0, 1) }), -1)).toBe("1 match in 1 chapter")
    expect(findStatus(results({ matches: [] }), -1)).toBe("No matches")
  })

  test("says which match it's on", () => {
    expect(findStatus(results({}), 1)).toBe("Match 2 of 3")
    expect(findStatus(results({ capped: true }), 0)).toBe("Match 1 of more than 10,000")
  })

  test("says when it isn't done or has too many", () => {
    expect(findStatus(results({ matches: [], partial: true }), -1)).toBe("Searching…")
    expect(findStatus(results({ partial: true }), -1)).toBe("3 matches so far")
    expect(findStatus(results({ partial: true }), 2)).toBe("Match 3 of 3 so far")
    expect(findStatus(results({ capped: true }), -1)).toBe("More than 10,000 matches")
  })
})

describe("seedQuery", () => {
  test("starts a search from a short selection on one line", () => {
    expect(seedQuery("Mara", false)).toBe("Mara")
    expect(seedQuery("a.b", false)).toBe("a.b")
    expect(seedQuery("a.b", true)).toBe("a\\.b")
    expect(seedQuery("x".repeat(200), false)).toHaveLength(200)
  })

  test("leaves the search alone for nothing, a long selection, or more than a line", () => {
    expect(seedQuery("", false)).toBeNull()
    expect(seedQuery("  ", false)).toBeNull()
    expect(seedQuery("one\ntwo", false)).toBeNull()
    expect(seedQuery("x".repeat(201), false)).toBeNull()
  })
})
