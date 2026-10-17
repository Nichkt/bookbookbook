import { describe, expect, test } from "vitest"
import { chapterOf, planOf } from "@/test/plan"
import { estimatedHeight, sceneNeighbors, sceneStops, sceneToShow, stopPath } from "./sequence"

const plan = planOf({
  acts: [
    {
      title: "One",
      chapters: [
        { title: "Harbor", scenes: [{ title: "Dock" }, { title: "Gone", deleted: true }, { title: "Boat" }] },
        { title: "Empty" },
      ],
    },
    { title: "Two", chapters: [{ title: "Whole", scenes: [{ implicit: true }] }] },
  ],
})

const names = (stops: ReturnType<typeof sceneStops>) =>
  stops.map((stop) => `${stop.chapter.title}/${stop.scene?.title || (stop.scene ? "implicit" : "none")}`)

describe("sceneStops", () => {
  test("every scene in reading order across acts, a chapter without scenes once, the Trash left out", () => {
    expect(names(sceneStops(plan))).toEqual(["Harbor/Dock", "Harbor/Boat", "Empty/none", "Whole/implicit"])
  })
})

describe("sceneNeighbors", () => {
  test("steps across chapter and act boundaries", () => {
    const boat = sceneNeighbors(plan, "ch-Harbor", "sc-Harbor-3")
    expect(boat.previous?.scene?.title).toBe("Dock")
    expect(boat.next).toMatchObject({ chapter: { title: "Empty" }, scene: null })

    const empty = sceneNeighbors(plan, "ch-Empty", null)
    expect(empty.previous?.scene?.id).toBe("sc-Harbor-3")
    expect(empty.next?.scene?.id).toBe("sc-Whole-1")
  })

  test("nothing before the first scene or after the last, and nothing for a scene not in the book", () => {
    expect(sceneNeighbors(plan, "ch-Harbor", "sc-Harbor-1").previous).toBeNull()
    expect(sceneNeighbors(plan, "ch-Whole", "sc-Whole-1").next).toBeNull()
    expect(sceneNeighbors(plan, "ch-Harbor", "sc-Harbor-2")).toEqual({ previous: null, next: null })
  })
})

describe("sceneToShow", () => {
  test("the scene in the URL, else the chapter's first, else none yet", () => {
    const harbor = chapterOf(plan, "Harbor")
    expect(sceneToShow(harbor, "sc-Harbor-3")?.title).toBe("Boat")
    expect(sceneToShow(harbor, null)?.title).toBe("Dock")
    expect(sceneToShow(harbor, "sc-Elsewhere-1")?.title).toBe("Dock")
    expect(sceneToShow(chapterOf(plan, "Empty"), null)).toBeNull()
  })
})

test("stopPath leaves the scene out for a chapter that has none yet", () => {
  const [first, , empty] = sceneStops(plan)
  expect(stopPath("book", first)).toBe("/b/book/write/ch-Harbor/sc-Harbor-1")
  expect(stopPath("book", empty)).toBe("/b/book/write/ch-Empty")
})

test("estimatedHeight grows with the words, from a floor", () => {
  expect(estimatedHeight(null)).toBe(120)
  expect(estimatedHeight(10)).toBe(120)
  expect(estimatedHeight(1000)).toBe(3200)
})
