import { describe, expect, test } from "vitest"
import { chapterOf, planOf } from "@/test/plan"
import { chapterStepTarget, neighborChapter, type ChapterStep } from "./commands"
import { LOOSE_GROUP, type Plan } from "./planData"

const plan = planOf({
  acts: [
    { title: "One", chapters: [{ title: "A" }, { title: "B" }] },
    { title: "Two", chapters: [{ title: "C" }] },
    { title: "Three", chapters: [] },
  ],
  loose: [{ title: "Stray" }, { title: "Waif" }],
})

/** Where a step lands, as `group@index`, or why it can't go. */
function landing(book: Plan, title: string, step: ChapterStep, crossActs: boolean) {
  const target = chapterStepTarget(book, chapterOf(book, title), step, crossActs)
  return typeof target === "string" ? target : `${target.group.key}@${target.index}`
}

describe("chapterStepTarget", () => {
  test("steps within a group", () => {
    expect(landing(plan, "B", "earlier", false)).toBe("act-One@0")
    expect(landing(plan, "A", "later", false)).toBe("act-One@1")
    expect(landing(plan, "Waif", "earlier", false)).toBe(`${LOOSE_GROUP}@0`)
  })

  test("on the Board, a step stops at the edge of its act", () => {
    expect(landing(plan, "B", "later", false)).toBe("Already the last chapter of this act.")
    expect(landing(plan, "C", "earlier", false)).toBe("Already the first chapter of this act.")
    expect(landing(plan, "Stray", "earlier", false)).toBe("Already the first chapter not in an act.")
  })

  test("in the Outline, a step crosses into the neighboring act, even an empty one", () => {
    expect(landing(plan, "B", "later", true)).toBe("act-Two@0")
    expect(landing(plan, "C", "earlier", true)).toBe("act-One@2")
    expect(landing(plan, "C", "later", true)).toBe("act-Three@0")
    expect(landing(plan, "Stray", "earlier", true)).toBe("act-Three@0")
  })

  test("the book's ends stop a step either way", () => {
    expect(landing(plan, "A", "earlier", true)).toBe("Already the first chapter.")
    expect(landing(plan, "Waif", "later", true)).toBe("Already the last chapter.")
    expect(landing(plan, "A", "earlier", false)).toBe("Already the first chapter.")
  })

  test("an act jump goes to the end of the act above or the start of the act below", () => {
    expect(landing(plan, "A", "previousAct", false)).toBe("There's no act above.")
    expect(landing(plan, "A", "nextAct", false)).toBe("act-Two@0")
    expect(landing(plan, "C", "previousAct", false)).toBe("act-One@2")
    expect(landing(plan, "C", "nextAct", false)).toBe("act-Three@0")
    expect(landing(plan, "Stray", "previousAct", false)).toBe("act-Three@0")
    expect(landing(plan, "Stray", "nextAct", false)).toBe("There's no act below.")
  })

  test("without acts, only the book's ends stop a step", () => {
    const flat = planOf({ loose: [{ title: "A" }, { title: "B" }] })
    expect(landing(flat, "A", "later", true)).toBe(`${LOOSE_GROUP}@1`)
    expect(landing(flat, "A", "earlier", true)).toBe("Already the first chapter.")
    expect(landing(flat, "B", "later", false)).toBe("Already the last chapter.")
    expect(landing(flat, "B", "previousAct", false)).toBe("There's no act above.")
  })
})

test("neighborChapter prefers the next chapter in reading order, then the one before", () => {
  expect(neighborChapter(plan, "ch-B")?.id).toBe("ch-C")
  expect(neighborChapter(plan, "ch-C")?.id).toBe("ch-Stray")
  expect(neighborChapter(plan, "ch-Waif")?.id).toBe("ch-Stray")
  expect(neighborChapter(plan, "nope")).toBeUndefined()
  expect(neighborChapter(planOf({ loose: [{ title: "Only" }] }), "ch-Only")).toBeUndefined()
})
