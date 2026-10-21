import { describe, expect, it } from "vitest"
import { termById } from "./glossary"
import { stepsFor, textOf, tourForPath, TOURS, type TourContext } from "./tours"

const PLAN_VIEWS = ["board", "outline", "corkboard", "matrix", "timeline"]
const PATHS = ["/", ...PLAN_VIEWS.map((view) => `/b/b1/plan/${view}`), "/b/b1/write/c1", "/b/b1/world", "/b/b1/inbox"]
const CONTEXTS: TourContext[] = PATHS.flatMap((pathname) =>
  [false, true].flatMap((narrow) => [false, true].map((coarse) => ({ narrow, coarse, pathname }))),
)
const steps = Object.entries(TOURS).flatMap(([id, tour]) => tour.steps.map((step) => ({ id, step })))
const planTargets = (view: string) =>
  stepsFor(TOURS.plan, { narrow: false, coarse: false, pathname: `/b/b1/plan/${view}` }).map((step) => step.target)

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

describe("stepsFor", () => {
  it("shows each Plan view the parts it has", () => {
    expect(planTargets("board")).toEqual([
      undefined,
      "plan-views",
      "plan-structure",
      "plan-ribbon",
      "plan-act",
      "plan-chapter",
      "popout-moments",
      "popout-details",
      "popout-write",
      "plan-add-chapter",
      "plan-add",
      "plan-display",
      "plan-filter",
      "save-status",
      "undo",
      undefined,
    ])
    expect(planTargets("corkboard")).toEqual(expect.arrayContaining(["plan-ribbon", "plan-add-chapter"]))
    expect(planTargets("corkboard")).not.toContain("plan-display")
    expect(planTargets("outline")).not.toContain("plan-ribbon")
    expect(planTargets("outline")).toEqual(
      expect.arrayContaining(["plan-act", "plan-chapter", "plan-add-chapter", "plan-display"]),
    )
    for (const view of ["matrix", "timeline"]) {
      for (const target of ["plan-ribbon", "plan-act", "plan-chapter", "plan-add-chapter", "plan-display"]) {
        expect(planTargets(view), `${view}: ${target}`).not.toContain(target)
      }
    }
    expect(planTargets("matrix")).toContain("plan-matrix")
    expect(planTargets("timeline")).toContain("plan-timeline-order")
  })

  it("keeps the chapter pop-out's steps, and the Plan's, in every view", () => {
    for (const view of PLAN_VIEWS) {
      expect(planTargets(view)).toEqual(
        expect.arrayContaining(["plan-views", "plan-structure", "popout-moments", "popout-write", "plan-filter"]),
      )
    }
  })

  it("tells the Board what Save and Back to planning do with a new chapter", () => {
    const step = TOURS.plan.steps.find((each) => each.target === "plan-add-chapter")!
    const on = (view: string) => textOf(step.body, { narrow: false, coarse: false, pathname: `/b/b1/plan/${view}` })
    expect(on("board")).toMatch(/Save to put it in your plan, or go Back to planning to leave it out\.$/)
    expect(on("outline")).toContain("adds a line there")
    expect(on("corkboard")).toContain("adds an index card there")
  })

  it("takes every step of tours that don't depend on the screen", () => {
    const context = { narrow: false, coarse: false, pathname: "/b/b1/write/c1" }
    expect(stepsFor(TOURS.write, context)).toEqual(TOURS.write.steps)
  })
})
