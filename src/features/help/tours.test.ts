import { describe, expect, it } from "vitest"
import { termById } from "./glossary"
import { textOf, tourForPath, TOURS, type TourContext } from "./tours"

const PATHS = ["/", "/b/b1/plan/board", "/b/b1/plan/outline", "/b/b1/write/c1", "/b/b1/world", "/b/b1/inbox"]
const CONTEXTS: TourContext[] = PATHS.flatMap((pathname) =>
  [false, true].flatMap((narrow) => [false, true].map((coarse) => ({ narrow, coarse, pathname }))),
)
const steps = Object.entries(TOURS).flatMap(([id, tour]) => tour.steps.map((step) => ({ id, step })))

describe("tourForPath", () => {
  it("finds each page's tour", () => {
    expect(tourForPath("/")).toBe("home")
    expect(tourForPath("/b/b1/plan")).toBe("plan")
    expect(tourForPath("/b/b1/plan/outline")).toBe("plan")
    expect(tourForPath("/b/b1/write")).toBe("write")
    expect(tourForPath("/b/b1/write/c1")).toBe("write")
    expect(tourForPath("/b/b1/world/e1")).toBe("world")
    expect(tourForPath("/b/b1/inbox")).toBe("inbox")
  })

  it("has none for pages without one", () => {
    for (const path of ["/b/b1", "/b/b1/planner", "/lab/ime", "/plan", "/nowhere"]) expect(tourForPath(path)).toBeNull()
  })
})

describe("TOURS", () => {
  it("offers only glossary terms that exist", () => {
    for (const { id, step } of steps) {
      if (step.term) expect(termById.has(step.term), `${id}: ${step.title}`).toBe(true)
    }
  })

  it("has a sentence for every step, on every screen", () => {
    for (const { id, step } of steps) {
      for (const context of CONTEXTS) {
        const text = textOf(step.body, context)
        expect(text, `${id}: ${step.title}`).toMatch(/^\S.*[.!?]$/)
        expect(text).not.toMatch(/\s{2}/)
      }
    }
  })

  it("doesn't ask a touch screen to point or hover", () => {
    for (const { step } of steps) {
      for (const context of CONTEXTS.filter((each) => each.coarse)) {
        expect(textOf(step.body, context)).not.toMatch(/\b(point at|rest the mouse|hover)/i)
      }
    }
  })

  it("opens the chapter pop-out only for what's in it", () => {
    for (const { step } of steps) {
      expect(step.stage === "chapter-popout", step.title).toBe(Boolean(step.target?.startsWith("popout-")))
    }
  })
})
