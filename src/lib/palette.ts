/**
 * The thread palette (DESIGN.md §15): ten hues that stay distinguishable in all three themes. Colors only ever mark
 * things that also carry a text label.
 */
export const PALETTE = [
  "#2A8C8C", // teal
  "#C2557A", // rose
  "#C98A2B", // amber
  "#6B7FA6", // slate blue
  "#8A63B8", // violet
  "#3F7D58", // green
  "#2E4A7D", // navy
  "#B5552E", // rust
  "#7D7A2E", // olive
  "#9A9488", // stone
] as const

const COLOR_NAMES: Record<(typeof PALETTE)[number], string> = {
  "#2A8C8C": "Teal",
  "#C2557A": "Rose",
  "#C98A2B": "Amber",
  "#6B7FA6": "Slate blue",
  "#8A63B8": "Violet",
  "#3F7D58": "Green",
  "#2E4A7D": "Navy",
  "#B5552E": "Rust",
  "#7D7A2E": "Olive",
  "#9A9488": "Stone",
}

/** "Teal" for the palette's teal, for screen readers; null for a color outside the palette. */
export function colorName(color: string | null | undefined): string | null {
  const key = color?.toUpperCase()
  const match = PALETTE.find((candidate) => candidate === key)
  return match ? COLOR_NAMES[match] : null
}

/** A stable color for a free-text label, so "storm" is the same color everywhere. */
export function colorFor(text: string): string {
  let hash = 0
  for (const char of text.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return PALETTE[hash % PALETTE.length]
}

/** The first palette color nobody uses yet, else the least used one. */
export function nextColor(used: readonly (string | null | undefined)[]): string {
  const counts = new Map<string, number>(PALETTE.map((color) => [color, 0]))
  for (const color of used) {
    const key = color?.toUpperCase()
    const match = PALETTE.find((candidate) => candidate === key)
    if (match) counts.set(match, counts.get(match)! + 1)
  }
  return [...counts.entries()].reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0]
}
