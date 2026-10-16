import { describe, expect, test } from "vitest"
import { planOf } from "@/test/plan"
import { caretAtEdge, outlineStops, rowKeyOf } from "./outlineNav"

const plan = planOf({
  acts: [
    {
      title: "One",
      chapters: [
        { title: "A", scenes: [{ title: "Dock" }, { title: "Ferry" }] },
        { title: "B", scenes: [{ implicit: true }] },
      ],
    },
    { title: "Two", chapters: [] },
  ],
  loose: [{ title: "Stray" }],
})

describe("outlineStops", () => {
  test("lists acts, chapters and the writer's own scenes in reading order", () => {
    expect(outlineStops(plan, false)).toEqual([
      "act:act-One",
      "chapter:ch-A",
      "scene:sc-A-1",
      "scene:sc-A-2",
      "chapter:ch-B",
      "act:act-Two",
      "chapter:ch-Stray",
    ])
  })

  test("puts each summary between its chapter's title and its scenes", () => {
    expect(outlineStops(plan, true)).toEqual([
      "act:act-One",
      "chapter:ch-A",
      "summary:ch-A",
      "scene:sc-A-1",
      "scene:sc-A-2",
      "chapter:ch-B",
      "summary:ch-B",
      "act:act-Two",
      "chapter:ch-Stray",
      "summary:ch-Stray",
    ])
  })

  test("a book without acts is just its chapters, and an empty book has no stops", () => {
    expect(outlineStops(planOf({ loose: [{ title: "A" }, { title: "B" }] }), false)).toEqual([
      "chapter:ch-A",
      "chapter:ch-B",
    ])
    expect(outlineStops(planOf({}), true)).toEqual([])
  })
})

test("rowKeyOf puts a summary in its chapter's row", () => {
  expect(rowKeyOf("summary:ch-A")).toBe("chapter:ch-A")
  expect(rowKeyOf("chapter:ch-A")).toBe("chapter:ch-A")
  expect(rowKeyOf("scene:sc-A-1")).toBe("scene:sc-A-1")
  expect(rowKeyOf("act:act-One")).toBe("act:act-One")
})

describe("caretAtEdge", () => {
  const field = (value: string, start: number | null, end = start) => ({
    value,
    selectionStart: start,
    selectionEnd: end,
  })
  const text = "two\nlines"

  test("↑ leaves only from the very start, ↓ only from the very end", () => {
    expect(caretAtEdge(field(text, 0), true)).toBe(true)
    expect(caretAtEdge(field(text, 0), false)).toBe(false)
    expect(caretAtEdge(field(text, text.length), false)).toBe(true)
    expect(caretAtEdge(field(text, text.length), true)).toBe(false)
    expect(caretAtEdge(field(text, 5), true)).toBe(false)
    expect(caretAtEdge(field(text, 5), false)).toBe(false)
  })

  test("an empty field leaves either way", () => {
    expect(caretAtEdge(field("", 0), true)).toBe(true)
    expect(caretAtEdge(field("", 0), false)).toBe(true)
  })

  test("a selection, or no caret, stays", () => {
    expect(caretAtEdge(field(text, 0, text.length), true)).toBe(false)
    expect(caretAtEdge(field(text, 0, text.length), false)).toBe(false)
    expect(caretAtEdge(field(text, null), true)).toBe(false)
  })
})
