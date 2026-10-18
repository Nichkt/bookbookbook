import { describe, expect, it } from "vitest"
import { placeCard, revealBy, spotlightBox, type Box } from "./tourLayout"

const viewport = { width: 1280, height: 720 }
const card = { width: 320, height: 200 }
const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height })

describe("placeCard", () => {
  it("centers the card when there's nothing to point at", () => {
    expect(placeCard(null, card, viewport)).toEqual({ left: 480, top: 260, side: "center" })
  })

  it("goes below the target when it fits, lined up with its middle", () => {
    expect(placeCard(box(500, 100, 200, 40), card, viewport)).toEqual({ left: 440, top: 152, side: "below" })
  })

  it("goes above when there's no room below", () => {
    expect(placeCard(box(500, 600, 200, 40), card, viewport)).toEqual({ left: 440, top: 388, side: "above" })
  })

  it("goes to the right, then the left, of a target too tall for either", () => {
    expect(placeCard(box(100, 100, 300, 500), card, viewport)).toEqual({ left: 412, top: 250, side: "right" })
    expect(placeCard(box(900, 100, 300, 500), card, viewport)).toEqual({ left: 568, top: 250, side: "left" })
  })

  it("sits over a target with no room beside it, against the edge with more room", () => {
    const phone = { width: 412, height: 915 }
    const wide = { width: 380, height: 260 }
    expect(placeCard(box(8, 200, 396, 600), wide, phone)).toEqual({ left: 16, top: 12, side: "over" })
    expect(placeCard(box(8, 100, 396, 600), wide, phone)).toEqual({ left: 16, top: 643, side: "over" })
  })

  it("keeps the card on screen beside a target near the edge", () => {
    expect(placeCard(box(1240, 100, 30, 30), card, viewport)).toEqual({ left: 948, top: 142, side: "below" })
    expect(placeCard(box(0, 100, 30, 30), card, viewport)).toEqual({ left: 12, top: 142, side: "below" })
  })
})

describe("spotlightBox", () => {
  it("lights a little more than the target", () => {
    expect(spotlightBox(box(100, 100, 200, 50), viewport)).toEqual(box(94, 94, 212, 62))
  })

  it("stays on screen", () => {
    expect(spotlightBox(box(-50, -20, 1400, 800), viewport)).toEqual(box(4, 4, 1272, 712))
  })

  it("keeps off the sticky bars, lighting only the part of a target that shows", () => {
    const clear = { top: 56, bottom: 655 }
    expect(spotlightBox(box(100, 30, 200, 100), viewport, clear)).toEqual(box(94, 56, 212, 80))
    expect(spotlightBox(box(100, 600, 200, 100), viewport, clear)).toEqual(box(94, 594, 212, 61))
  })

  it("treats a band reaching the edges of the screen as no bars at all", () => {
    const target = box(100, 0, 200, 50)
    expect(spotlightBox(target, viewport, { top: 0, bottom: 720 })).toEqual(spotlightBox(target, viewport))
  })

  it("lights nothing when none of the target shows", () => {
    expect(spotlightBox(box(100, -200, 200, 100), viewport)).toBeNull()
    expect(spotlightBox(box(1400, 100, 200, 50), viewport)).toBeNull()
    expect(spotlightBox(box(100, 20, 200, 20), viewport, { top: 56, bottom: 720 })).toBeNull()
  })
})

describe("revealBy", () => {
  const clear = { top: 56, bottom: 720 }

  it("leaves a target that shows where it is", () => {
    expect(revealBy(box(100, 200, 200, 50), clear, viewport)).toBe("none")
  })

  it("scrolls just far enough to a target off screen or under a bar", () => {
    expect(revealBy(box(100, 900, 200, 50), clear, viewport)).toBe("nearest")
    expect(revealBy(box(100, 30, 200, 50), clear, viewport)).toBe("nearest")
    expect(revealBy(box(-300, 200, 200, 50), clear, viewport)).toBe("nearest")
  })

  it("leaves a target taller than the clear band once it fills half of it, else scrolls to its top", () => {
    expect(revealBy(box(100, 100, 200, 1000), clear, viewport)).toBe("none")
    expect(revealBy(box(100, 500, 200, 1000), clear, viewport)).toBe("start")
    expect(revealBy(box(100, -900, 200, 1000), clear, viewport)).toBe("start")
    expect(revealBy(box(-300, 100, 200, 1000), clear, viewport)).toBe("start")
  })
})
