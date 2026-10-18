import { FEEDBACK_HEADINGS, SENSES } from "./tools"

/*
 * Turns answers into what their cards show (DESIGN.md §9 "Tools"): prose cleaned of what models wrap it in, and the
 * lists, senses, names, summaries and notes the other tools ask for. Models stray from the format they're asked for,
 * so each parser takes what it can and keeps the rest.
 */

/** The tags context.ts wraps the writer's text in, which models sometimes echo. */
const ECHOED_TAG = /<\/?(?:text_before_caret|text_after_caret|text_before|selected_text|text_after|chapter|samples)>/gi
/** "Here's the continuation:" and the like, alone on the first line. */
const PREAMBLE = /^(?:here(?:'s| is| are)|sure|certainly|okay|of course)\b[^\n]{0,80}:[ \t]*(?:\n|$)/i

/** Prose fit for the book: no thinking, code fences, echoed tags or "Here's…" line. Keeps a leading line break. */
export function cleanProse(raw: string): string {
  let text = raw
  let stripped = false
  const strip = (pattern: RegExp) => {
    const next = text.replace(pattern, "")
    if (next !== text) stripped = true
    text = next
  }
  // Reasoning models think first; while one streams, the thinking isn't closed yet.
  strip(/<think>[\s\S]*?(?:<\/think>|$)/gi)
  strip(/^[\s\S]*?<\/think>/i)
  strip(/^\s*```[\w-]*[ \t]*\n/)
  strip(/\n?```\s*$/)
  strip(ECHOED_TAG)
  strip(new RegExp(`^\\s*${PREAMBLE.source}`, "i"))
  const body = text.trim()
  if (!body) return ""
  return !stripped && /^[ \t]*\n/.test(text) ? `\n${body}` : body
}

const MARKER = /^\s*(?:[-*•–]|\d{1,2}[.)])\s+/
const unbold = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1")
const clean = (line: string) => unbold(line.replace(MARKER, "")).trim()

/** List items: numbered or bulleted lines, each with any lines that run on from it. Unmarked text, line by line. */
export function parseList(raw: string): string[] {
  const text = cleanProse(raw)
  const rows = text.split("\n")
  if (!rows.some((row) => MARKER.test(row))) return rows.map(clean).filter(Boolean)
  const items: string[] = []
  let open = false
  for (const row of rows) {
    if (MARKER.test(row)) {
      items.push(clean(row))
      open = true
    } else if (!row.trim()) {
      open = false
    } else if (open && items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${clean(row)}`.trim()
    }
  }
  return items.filter(Boolean)
}

export interface Group {
  heading: string
  items: string[]
}

/**
 * Lines under headings, the headings matched loosely ("**Sight:**", "## Smell", "Metaphors"); text on a heading's own
 * line counts as its first item. Lines before any heading go in a last group, "More".
 */
function parseGroups(raw: string, headings: readonly string[]): Group[] {
  const byKey = new Map(headings.map((heading) => [heading.toLowerCase(), { heading, items: [] as string[] }]))
  const more: Group = { heading: "More", items: [] }
  const keys = headings.map((heading) => heading.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  // A heading is alone on its line, or followed by a colon: "Sound carries over the water" is an item.
  const pattern = new RegExp(
    `^\\s*(?:#{1,4}\\s*)?\\**\\s*(${keys.join("|")})s?\\s*\\**\\s*(?::\\s*\\**\\s*(.*?))?\\s*$`,
    "i",
  )
  let current: Group = more
  for (const row of cleanProse(raw).split("\n")) {
    const match = pattern.exec(row)
    const heading = match && byKey.get(match[1].toLowerCase())
    if (heading) {
      current = heading
      const rest = clean(match[2] ?? "")
      if (rest) current.items.push(rest)
      continue
    }
    const item = clean(row)
    if (item) current.items.push(item)
  }
  return [...byKey.values(), more].filter((group) => group.items.length > 0)
}

/** Describe's answer, by sense. */
export const parseSenses = (raw: string) => parseGroups(raw, SENSES)

/** Chapter feedback, by heading. */
export const parseFeedback = (raw: string) => parseGroups(raw, FEEDBACK_HEADINGS)

export interface NameIdea {
  name: string
  note: string
}

const NAME_SEPARATOR = /\s+[—–-]\s+|\s*[—–]\s*|:\s+/

/** "Bryn Calloway — sharp, old money": the name and what it says. */
export function parseNames(raw: string): NameIdea[] {
  return parseList(raw).flatMap((item) => {
    const match = NAME_SEPARATOR.exec(item)
    const name = (match ? item.slice(0, match.index) : item).replace(/^["“'*]+|["”'*]+$/g, "").trim()
    if (!name || name.length > 60) return []
    return [{ name, note: match ? item.slice(match.index + match[0].length).trim() : "" }]
  })
}

/** "Wren: a ferry pilot who…": the name an idea starts with, before a colon or dash, and the rest. */
const IDEA_NAME = /^["“]?([^:—–\n]{1,60}?)["”]?\s*(?::|\s[—–-]\s|[—–])\s*(?=\S)/

/** An idea split into the name it starts with and the rest, for Add to World. Null when it doesn't start with one. */
export function ideaParts(idea: string): NameIdea | null {
  const match = IDEA_NAME.exec(idea)
  if (!match) return null
  const name = match[1].trim()
  if (!name || /[.!?]/.test(name)) return null
  return { name, note: idea.slice(match[0].length).trim() }
}

/** The name an idea starts with, before a colon or dash ("Wren: a ferry pilot who…"), for Add to World. */
export const ideaName = (idea: string): string | null => ideaParts(idea)?.name ?? null

export interface ChapterSummary {
  summary: string
  moments: string[]
}

/** "Summary: …" and the moments after "Moments:" (or the first list), for the chapter's plan. */
export function parseSummary(raw: string): ChapterSummary {
  const text = cleanProse(raw)
  const heading = /^\s*(?:#{1,4}\s*)?\**\s*moments\s*\**\s*:?\s*\**\s*$/im.exec(text)
  let head = text
  let tail = ""
  if (heading) {
    head = text.slice(0, heading.index)
    tail = text.slice(heading.index + heading[0].length)
  } else {
    const rows = text.split("\n")
    const first = rows.findIndex((row) => MARKER.test(row))
    if (first >= 0) {
      head = rows.slice(0, first).join("\n")
      tail = rows.slice(first).join("\n")
    }
  }
  const summary = unbold(head.replace(/^\s*(?:#{1,4}\s*)?\**\s*summary\s*\**\s*:?\s*\**\s*/i, ""))
    .replace(/\s*\n\s*/g, " ")
    .trim()
  return { summary, moments: tail ? parseList(tail) : [] }
}
