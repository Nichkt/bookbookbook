import type { LucideIcon } from "lucide-react"

/*
 * The command palette's commands and how a search ranks them (DESIGN.md §4 "Command palette"). Pure, so it's tested
 * without a page. The palette is CommandPalette.tsx; the app's own commands are in useAppCommands.ts, and each
 * screen adds its own with usePaletteSource.
 */

/** The palette's sections, in the order they show before anything's typed. */
export const PALETTE_GROUPS = [
  "Actions",
  "AI tools",
  "Go to",
  "Chapters",
  "Scenes",
  "World",
  "Books",
  "Help",
  "Appearance",
] as const
export type PaletteGroup = (typeof PALETTE_GROUPS)[number]

export interface PaletteCommand {
  /** Unique in the palette: a screen's command replaces the app's one with the same id. */
  id: string
  label: string
  group: PaletteGroup
  /** Other words it answers to, like a chapter's number or an entry's other names. */
  keywords?: readonly string[]
  /** Its shortcut, written as shortcutLabel takes it: "Mod+Shift+F". */
  keys?: string
  icon?: LucideIcon
  /** A few muted words after the label, like the chapter a scene's in. */
  hint?: string
  /** For a setting or a view: whether it's the one in use. */
  checked?: boolean
  disabled?: boolean
  /** Listed only once something's typed, as there can be hundreds: chapters, scenes, entries, glossary terms. */
  searchOnly?: boolean
  /** Ranked a step below commands that match as well, as a glossary term is: it explains a word rather than does it. */
  lesser?: boolean
  /**
   * Whether it takes focus somewhere itself, as going to another page or a new chapter does. Otherwise focus goes
   * back where it was before it runs, as a shortcut would find it.
   */
  movesFocus?: boolean
  /** Does it. `from` had focus as the palette opened, if anything did. */
  run: (from: HTMLElement | null) => void
}

export interface PaletteSection {
  group: PaletteGroup
  commands: PaletteCommand[]
}

/** Lowercase and without accents, so "zoe" finds "Zoë". */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

const wordsOf = (text: string) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

interface Query {
  /** The words typed, folded, with single spaces between. */
  phrase: string
  words: string[]
}

function prepare(query: string): Query {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return { phrase: words.join(" "), words }
}

type Tier = 0 | 2 | 3 | 4

/**
 * How well a field matches: 4 when it starts with the query, 3 when every word typed starts one of its words, 2 when
 * every word typed is somewhere in it, else 0.
 */
function tier(field: string, query: Query): Tier {
  if (field.startsWith(query.phrase)) return 4
  const words = wordsOf(field)
  if (query.words.every((word) => words.some((candidate) => candidate.startsWith(word)))) return 3
  if (query.words.every((word) => field.includes(word))) return 2
  return 0
}

/**
 * Scores by tier. The label is what shows, so words typed starting its words beat anything in the keywords, but
 * letters found inside its words count for less than a keyword's start.
 */
const LABEL_SCORES: Record<Tier, number> = { 0: 0, 2: 4, 3: 7, 4: 8 }
const KEYWORD_SCORES: Record<Tier, number> = { 0: 0, 2: 3, 3: 5, 4: 6 }
/** Words found only across the label and keywords together. */
const SPREAD_SCORE = 2

type Scored = Pick<PaletteCommand, "label" | "keywords" | "lesser">

function score(command: Scored, query: Query): number {
  if (query.words.length === 0) return 0
  const label = fold(command.label)
  const keywords = (command.keywords ?? []).map(fold)
  let best = LABEL_SCORES[tier(label, query)]
  for (const keyword of keywords) best = Math.max(best, KEYWORD_SCORES[tier(keyword, query)])
  if (best === 0) {
    const everything = [label, ...keywords].join(" ")
    if (!query.words.every((word) => everything.includes(word))) return 0
    best = SPREAD_SCORE
  }
  // A step down, never to 0, so it's still found.
  return command.lesser ? best - 1 : best
}

/**
 * A command's score for what's typed, higher being better, or 0 when it doesn't match. The label counts for more
 * than the keywords; words found only across the label and keywords together score least. A lesser command scores
 * a step below what it would.
 */
export const scoreCommand = (command: Scored, query: string) => score(command, prepare(query))

/**
 * One list from the showing screens' commands then the app's: a command with an id already listed is left out, so a
 * screen's command takes the place of the app's, and a screen's actions come before the app's in their section.
 */
export function mergeCommands(...lists: readonly (readonly PaletteCommand[])[]): PaletteCommand[] {
  const byId = new Map<string, PaletteCommand>()
  for (const list of lists) for (const command of list) if (!byId.has(command.id)) byId.set(command.id, command)
  return [...byId.values()]
}

const groupOrder = (group: PaletteGroup) => PALETTE_GROUPS.indexOf(group)

/**
 * What the palette lists for what's typed, in sections. With nothing typed: every command that isn't search-only,
 * in the sections' usual order. Otherwise the matches, best first: the section with the best match leads, and within
 * a section better matches come first, ties keeping the order they were given in.
 */
export function searchCommands(commands: readonly PaletteCommand[], query: string): PaletteSection[] {
  const prepared = prepare(query)
  const typed = prepared.words.length > 0
  const scored = commands
    .map((command, index) => ({ command, index, score: typed ? score(command, prepared) : 0 }))
    .filter((item) => (typed ? item.score > 0 : !item.command.searchOnly))

  const sections = new Map<PaletteGroup, typeof scored>()
  for (const item of scored) {
    const section = sections.get(item.command.group)
    if (section) section.push(item)
    else sections.set(item.command.group, [item])
  }
  const best = (items: typeof scored) => Math.max(...items.map((item) => item.score))
  return [...sections.entries()]
    .sort(([a, aItems], [b, bItems]) => best(bItems) - best(aItems) || groupOrder(a) - groupOrder(b))
    .map(([group, items]) => ({
      group,
      commands: items.sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.command),
    }))
}
