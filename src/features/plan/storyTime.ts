/**
 * In-story time (DESIGN.md §6): a small structure so loose and exact timelines both work. Stored as JSON text in
 * `chapters.story_time` and `scenes.story_time`. M0 stored plain strings ("Day 1 morning"), which still parse.
 */
export const DAY_PARTS = ["dawn", "morning", "midday", "afternoon", "evening", "night"] as const
export type DayPart = (typeof DAY_PARTS)[number]

export interface StoryTime {
  mode: "relative" | "date"
  /** Story day, counted from wherever the author likes. */
  day?: number
  part?: DayPart
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, local time. */
  date?: string
  /** Free text shown instead of the computed time, like "12 years earlier". */
  label?: string
  /** Marks a stretch outside the main timeline. The Timeline (M5) compresses these. */
  era?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/
const LEGACY_DAY_RE = /^day\s+(-?\d+)(?:[\s,·-]+(dawn|morning|midday|noon|afternoon|evening|night))?$/i
const LEGACY_FLASHBACK_RE = /\b(earlier|ago|before|flashback)\b/i

const isDayPart = (value: unknown): value is DayPart => DAY_PARTS.includes(value as DayPart)
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)

/** Drops unknown or empty fields. Returns null when nothing is left. */
export function normalizeStoryTime(input: Partial<StoryTime> | null | undefined): StoryTime | null {
  if (!input || typeof input !== "object") return null
  const day = typeof input.day === "number" && Number.isInteger(input.day) ? input.day : undefined
  const part = isDayPart(input.part) ? input.part : undefined
  const date = typeof input.date === "string" && DATE_RE.test(input.date) ? input.date : undefined
  const label = text(input.label)
  const era = text(input.era)
  const mode = input.mode === "date" || (input.mode !== "relative" && date) ? "date" : "relative"
  const time: StoryTime = { mode }
  if (mode === "date") {
    if (date) time.date = date
  } else {
    if (day !== undefined) time.day = day
    if (part) time.part = part
  }
  if (label) time.label = label
  if (era) time.era = era
  return time.day !== undefined || time.part || time.date || time.label ? time : null
}

/** Reads the stored value: JSON, or an M0-era plain string. */
export function parseStoryTime(raw: string | null | undefined): StoryTime | null {
  const value = raw?.trim()
  if (!value) return null
  if (value.startsWith("{")) {
    try {
      return normalizeStoryTime(JSON.parse(value) as Partial<StoryTime>)
    } catch {
      // Not JSON after all: treat it as text below.
    }
  }
  return storyTimeFromText(value)
}

/** Turns free text into a story time: "Day 3 evening" becomes day + part, anything else becomes a label. */
export function storyTimeFromText(value: string): StoryTime | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = LEGACY_DAY_RE.exec(trimmed)
  if (match) {
    const part = match[2]?.toLowerCase()
    return normalizeStoryTime({
      mode: "relative",
      day: Number(match[1]),
      part: part === "noon" ? "midday" : (part as DayPart | undefined),
    })
  }
  return normalizeStoryTime({
    mode: "relative",
    label: trimmed,
    era: LEGACY_FLASHBACK_RE.test(trimmed) ? "flashback" : undefined,
  })
}

/** JSON for the database, or null when there's nothing to store. */
export function serializeStoryTime(time: Partial<StoryTime> | null | undefined): string | null {
  const normalized = normalizeStoryTime(time)
  return normalized ? JSON.stringify(normalized) : null
}

function formatDate(date: string, locale?: string) {
  const [day, time] = date.split("T")
  const [year, month, dayOfMonth] = day.split("-").map(Number)
  // setFullYear, because the Date constructor maps years 0–99 to 1900–1999.
  const value = new Date(2000, month - 1, dayOfMonth)
  value.setFullYear(year)
  const formatted = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(value)
  return time ? `${formatted}, ${time}` : formatted
}

/** The computed part alone: "Day 3, evening", "Oct 4, 1891, 21:00". Empty when there is none. */
export function formatStoryTimeValue(time: StoryTime | null, locale?: string): string {
  if (!time) return ""
  if (time.mode === "date") return time.date ? formatDate(time.date, locale) : ""
  if (time.day !== undefined) return time.part ? `Day ${time.day}, ${time.part}` : `Day ${time.day}`
  return time.part ? time.part[0].toUpperCase() + time.part.slice(1) : ""
}

/** What cards show: the label if there is one, then the computed time. */
export function formatStoryTime(time: StoryTime | null, locale?: string): string {
  if (!time) return ""
  const value = formatStoryTimeValue(time, locale)
  if (time.label) return value ? `${time.label} · ${value}` : time.label
  return value
}
