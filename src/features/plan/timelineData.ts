import { parseFields } from "@/features/codex/codexData"
import { colorFor } from "@/lib/palette"
import type { Plan, PlanChapter, PlanEntry } from "./planData"
import { DAY_PARTS, formatStoryTimeValue, storyTimeFromText, type StoryTime } from "./storyTime"

/*
 * The Timeline (DESIGN.md §6): chapters by when they happen in the story, one lane per point-of-view character, with
 * the World's events alongside. Stretches outside the main timeline, like flashbacks, can't be placed against it, so
 * they come first, squeezed together and headed with their names.
 */

/** The lane for chapters without a point of view. */
export const NO_POV = "__none"

/** The World's events, read with their When field. */
export const EVENTS_SQL = `
  SELECT e.id, e.name, e.color, e.fields
  FROM codex_entries e
    JOIN books b ON b.universe_id = e.universe_id
    JOIN codex_types t ON t.id = e.type_id
  WHERE b.id = ? AND e.deleted_at IS NULL AND t.key = 'events'`

export interface EventRow {
  id: string
  name: string | null
  color: string | null
  fields: string | null
}

export interface TimelineEvent {
  id: string
  name: string
  color: string
  /** As typed in the event's When field. */
  when: string
  time: StoryTime | null
}

export function eventsFromRows(rows: readonly EventRow[]): TimelineEvent[] {
  return rows
    .map((row) => {
      const name = row.name?.trim() || "Unnamed"
      const when = parseFields(row.fields).When?.trim() ?? ""
      return { id: row.id, name, color: row.color || colorFor(name), when, time: storyTimeFromText(when) }
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
}

export interface TimelineLane {
  /** The character's id, or NO_POV. */
  key: string
  entry: PlanEntry | null
}

export interface TimelineSlot {
  key: string
  /** The column heading: "Day 4, night", a date, or a label like "12 years earlier". */
  label: string
  /** The stretch outside the main timeline it belongs to. */
  era: string | null
  chapters: PlanChapter[]
  events: TimelineEvent[]
}

export interface EraSpan {
  era: string
  span: number
}

export interface StoryOrder {
  lanes: TimelineLane[]
  /** Era slots first, then the main timeline. */
  slots: TimelineSlot[]
  /** Headings over the era slots, in order. */
  eras: EraSpan[]
  /** Chapters with no story time, or only a label or a part of the day. */
  unplaced: PlanChapter[]
  unplacedEvents: TimelineEvent[]
}

/** Where a chapter in reading order leaves the story's clock. */
export type TimeJump = { kind: "back"; from: number } | { kind: "outside"; era: string }

export interface ReadingColumn {
  chapter: PlanChapter
  jump: TimeJump | null
}

export interface ReadingOrder {
  lanes: TimelineLane[]
  columns: ReadingColumn[]
}

interface Placement {
  /** Story days before dates: the two can't be compared. */
  rank: 0 | 1
  day: number
  /** -1 for a day without a part, which comes first. */
  part: number
  date: string
}

function placementOf(time: StoryTime | null): Placement | null {
  if (!time) return null
  if (time.mode === "date") return time.date ? { rank: 1, day: 0, part: 0, date: time.date } : null
  if (time.day === undefined) return null
  return { rank: 0, day: time.day, part: time.part ? DAY_PARTS.indexOf(time.part) : -1, date: "" }
}

const comparePlacements = (a: Placement, b: Placement) =>
  a.rank - b.rank || a.day - b.day || a.part - b.part || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

const placementKey = (placement: Placement) =>
  placement.rank === 1 ? `t:${placement.date}` : `d:${placement.day}:${placement.part}`

/** Point-of-view characters in order of their first chapter, then "no point of view" if any chapter lacks one. */
function lanesOf(plan: Plan, chapters: readonly PlanChapter[] = plan.chapters): TimelineLane[] {
  const lanes: TimelineLane[] = []
  const seen = new Set<string>()
  let unassigned = false
  for (const chapter of chapters) {
    const entry = chapter.pov_entry_id ? plan.entries.get(chapter.pov_entry_id) : undefined
    if (!entry) unassigned = true
    else if (!seen.has(entry.id)) {
      seen.add(entry.id)
      lanes.push({ key: entry.id, entry })
    }
  }
  if (unassigned || lanes.length === 0) lanes.push({ key: NO_POV, entry: null })
  return lanes
}

/** The lane a chapter goes in. */
export function laneOf(plan: Plan, chapter: PlanChapter): string {
  return chapter.pov_entry_id && plan.entries.has(chapter.pov_entry_id) ? chapter.pov_entry_id : NO_POV
}

interface SlotDraft extends TimelineSlot {
  placement: Placement | null
  /** First seen, for slots that can't be placed. */
  seen: number
}

export function storyOrder(plan: Plan, events: readonly TimelineEvent[]): StoryOrder {
  const slots = new Map<string, SlotDraft>()
  const unplaced: PlanChapter[] = []
  const unplacedEvents: TimelineEvent[] = []
  const eraOrder: string[] = []

  const slotFor = (time: StoryTime | null): SlotDraft | null => {
    if (!time) return null
    const placement = placementOf(time)
    const era = time.era ?? null
    if (!era && !placement) return null
    let key: string
    let label: string
    if (era) {
      label = time.label || formatStoryTimeValue(time) || era
      key = `e:${era}|${placement ? placementKey(placement) : `l:${label.toLowerCase()}`}`
      if (!eraOrder.includes(era)) eraOrder.push(era)
    } else {
      key = placementKey(placement!)
      label = formatStoryTimeValue(time)
    }
    let slot = slots.get(key)
    if (!slot) {
      slot = { key, label, era, chapters: [], events: [], placement, seen: slots.size }
      slots.set(key, slot)
    }
    return slot
  }

  for (const chapter of plan.chapters) {
    const slot = slotFor(chapter.time)
    if (slot) slot.chapters.push(chapter)
    else unplaced.push(chapter)
  }
  for (const event of events) {
    const slot = slotFor(event.time)
    if (slot) slot.events.push(event)
    else unplacedEvents.push(event)
  }

  // Within an era, placed slots by time, then the rest as first seen. The main timeline is all placed.
  const ordered = (list: SlotDraft[]) => [
    ...list.filter((slot) => slot.placement).sort((a, b) => comparePlacements(a.placement!, b.placement!)),
    ...list.filter((slot) => !slot.placement).sort((a, b) => a.seen - b.seen),
  ]
  const all = [...slots.values()]
  const eraSlots = eraOrder.flatMap((era) => ordered(all.filter((slot) => slot.era === era)))
  const mainSlots = ordered(all.filter((slot) => !slot.era))
  const strip = ({ key, label, era, chapters, events: slotEvents }: SlotDraft): TimelineSlot => ({
    key,
    label,
    era,
    chapters,
    events: slotEvents,
  })

  return {
    // Only lanes with a chapter to show: the unplaced are listed apart.
    lanes: lanesOf(plan, plan.chapters.filter((chapter) => !unplaced.includes(chapter))),
    slots: [...eraSlots, ...mainSlots].map(strip),
    eras: eraOrder.map((era) => ({ era, span: eraSlots.filter((slot) => slot.era === era).length })),
    unplaced,
    unplacedEvents,
  }
}

/**
 * Chapters as the reader meets them, each marked where it leaves the clock: a stretch outside the main timeline, or
 * a step back from the latest time before it.
 */
export function readingOrder(plan: Plan): ReadingOrder {
  let latest: { placement: Placement; number: number } | null = null
  const columns = plan.chapters.map((chapter): ReadingColumn => {
    const era = chapter.time?.era
    if (era) return { chapter, jump: { kind: "outside", era } }
    const placement = placementOf(chapter.time)
    if (!placement) return { chapter, jump: null }
    const jump: TimeJump | null =
      latest && comparePlacements(placement, latest.placement) < 0 ? { kind: "back", from: latest.number } : null
    if (!latest || comparePlacements(placement, latest.placement) >= 0) latest = { placement, number: chapter.number }
    return { chapter, jump }
  })
  return { lanes: lanesOf(plan), columns }
}
