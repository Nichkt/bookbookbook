export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** The part of the screen, top to bottom, that the page's sticky bars leave clear. */
export interface Band {
  top: number
  bottom: number
}

/** Where the card ended up: beside the target, over it when nothing beside fits, or centered with no target. */
export type CardSide = "below" | "above" | "right" | "left" | "over" | "center"

export interface CardPlacement {
  left: number
  top: number
  side: CardSide
}

/** Space between the card and what it points at. */
const GAP = 12
/** Space kept between the card and the edges of the screen. */
const MARGIN = 12

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/**
 * Where a tour card goes (DESIGN.md §17a): below what it points at if it fits, else above, else to the right or left.
 * When it fits nowhere beside it (a big target, or a small screen), it sits over it, against the top or bottom edge of
 * the screen, whichever has more room. With nothing to point at, it's centered.
 */
export function placeCard(target: Box | null, card: Size, viewport: Size): CardPlacement {
  const fitX = (x: number) => Math.round(clamp(x, MARGIN, viewport.width - card.width - MARGIN))
  const fitY = (y: number) => Math.round(clamp(y, MARGIN, viewport.height - card.height - MARGIN))
  if (!target) {
    return { left: fitX((viewport.width - card.width) / 2), top: fitY((viewport.height - card.height) / 2), side: "center" }
  }

  const right = target.left + target.width
  const bottom = target.top + target.height
  const alignedX = fitX(target.left + target.width / 2 - card.width / 2)
  const alignedY = fitY(target.top + target.height / 2 - card.height / 2)

  if (bottom + GAP + card.height <= viewport.height - MARGIN) {
    return { left: alignedX, top: Math.round(bottom + GAP), side: "below" }
  }
  if (target.top - GAP - card.height >= MARGIN) {
    return { left: alignedX, top: Math.round(target.top - GAP - card.height), side: "above" }
  }
  if (right + GAP + card.width <= viewport.width - MARGIN) {
    return { left: Math.round(right + GAP), top: alignedY, side: "right" }
  }
  if (target.left - GAP - card.width >= MARGIN) {
    return { left: Math.round(target.left - GAP - card.width), top: alignedY, side: "left" }
  }
  const roomAbove = target.top
  const roomBelow = viewport.height - bottom
  return {
    left: fitX((viewport.width - card.width) / 2),
    top: roomAbove > roomBelow ? MARGIN : fitY(viewport.height - card.height - MARGIN),
    side: "over",
  }
}

/**
 * The lit-up area around a target: a little bigger than it, kept on screen and off the page's sticky bars (so part of
 * a target scrolled under the header stays dim). None when none of it shows.
 */
export function spotlightBox(target: Box, viewport: Size, clear?: Band, pad = 6, inset = 4): Box | null {
  const minTop = clear && clear.top > 0 ? clear.top : inset
  const maxBottom = clear && clear.bottom < viewport.height ? clear.bottom : viewport.height - inset
  const left = Math.round(Math.max(target.left - pad, inset))
  const top = Math.round(Math.max(target.top - pad, minTop))
  const right = Math.round(Math.min(target.left + target.width + pad, viewport.width - inset))
  const bottom = Math.round(Math.min(target.top + target.height + pad, maxBottom))
  if (right - left < 1 || bottom - top < 1) return null
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * How to scroll a step's target into view: not at all if it shows, or if it's taller than the clear part of the screen
 * and already fills half of it; to its top if it's that tall; else just far enough.
 */
export function revealBy(target: Box, clear: Band, viewport: Size): "none" | "start" | "nearest" {
  const room = clear.bottom - clear.top
  const bottom = target.top + target.height
  const across = target.left >= 0 && target.left + target.width <= viewport.width
  if (target.height > room) {
    const shown = Math.min(bottom, clear.bottom) - Math.max(target.top, clear.top)
    return across && shown >= room / 2 ? "none" : "start"
  }
  return across && target.top >= clear.top && bottom <= clear.bottom ? "none" : "nearest"
}
