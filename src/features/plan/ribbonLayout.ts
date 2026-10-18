/*
 * Layout for the structure ribbon's pins (DESIGN.md §6): moments close together in the book would overlap, so they
 * stack in tiers above the bar.
 */

export const MAX_PIN_TIERS = 3

/**
 * A tier for each pin, 0 being nearest the bar. `positions` are fractions of the bar (0 to 1), `width` and `gap` are
 * pixels: pins whose centers are closer than `gap` go in different tiers. Once every tier is taken, a pin goes where
 * the last pin is furthest away. All 0 until the bar has a width.
 */
export function pinTiers(
  positions: readonly number[],
  width: number,
  gap: number,
  maxTiers = MAX_PIN_TIERS,
): number[] {
  const tiers = positions.map(() => 0)
  if (width <= 0) return tiers
  const order = positions
    .map((at, index) => ({ x: at * width, index }))
    .sort((a, b) => a.x - b.x || a.index - b.index)
  /** The center of the last pin in each tier so far. */
  const last: number[] = []
  for (const { x, index } of order) {
    let tier = last.findIndex((previous) => x - previous >= gap)
    if (tier === -1) {
      if (last.length < maxTiers) tier = last.length
      else tier = last.indexOf(Math.min(...last))
    }
    last[tier] = x
    tiers[index] = tier
  }
  return tiers
}
