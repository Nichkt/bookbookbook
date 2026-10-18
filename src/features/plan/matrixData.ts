import type { MentionCounts } from "@/features/codex/appearances"
import type { Plan, PlanChapter, PlanEntry } from "./planData"
import { actLabel } from "./status"

/*
 * The Matrix (DESIGN.md §6): characters and story points down the side in the World's order, chapters across the
 * top, and in each cell whether the entry is in the chapter. Rows keep their place as cells change.
 */

/** A story point missing from this many chapters in a row, between two it's in, has gone quiet. */
export const QUIET_CHAPTERS = 3

/** ★ point of view, ● present, ○ mentioned in the text but not marked present. */
export type MatrixMark = "pov" | "present" | "mentioned" | "none"

export interface QuietStretch {
  /** Indexes into the columns, inclusive. */
  from: number
  to: number
  length: number
}

export interface MatrixRow {
  kind: "character" | "thread"
  entry: PlanEntry
  marks: MatrixMark[]
  /** Mentions in each chapter's text, for characters. */
  mentions: number[]
  quiet: QuietStretch[]
}

export interface MatrixActSpan {
  key: string
  label: string
  span: number
}

export interface Matrix {
  columns: PlanChapter[]
  /** Empty when the book has no acts. */
  acts: MatrixActSpan[]
  characters: MatrixRow[]
  threads: MatrixRow[]
}

/** The gaps of at least `min` chapters between two chapters a story point is in. */
export function quietStretches(present: readonly boolean[], min = QUIET_CHAPTERS): QuietStretch[] {
  const stretches: QuietStretch[] = []
  let last = -1
  present.forEach((on, index) => {
    if (!on) return
    const gap = index - last - 1
    if (last !== -1 && gap >= min) stretches.push({ from: last + 1, to: index - 1, length: gap })
    last = index
  })
  return stretches
}

export function buildMatrix(plan: Plan, mentions: MentionCounts = new Map()): Matrix {
  const columns = plan.chapters
  const characters = (plan.entriesByType.get("characters") ?? []).map((entry): MatrixRow => {
    const counts = mentions.get(entry.id)
    const counted = columns.map((chapter) => counts?.get(chapter.id) ?? 0)
    return {
      kind: "character",
      entry,
      marks: columns.map((chapter, index) => {
        if (chapter.pov_entry_id === entry.id) return "pov"
        if (chapter.present.includes(entry.id)) return "present"
        return counted[index] > 0 ? "mentioned" : "none"
      }),
      mentions: counted,
      quiet: [],
    }
  })
  const threads = (plan.entriesByType.get("plot_threads") ?? []).map((entry): MatrixRow => {
    const on = columns.map((chapter) => chapter.threads.includes(entry.id))
    return {
      kind: "thread",
      entry,
      marks: on.map((value) => (value ? "present" : "none")),
      mentions: columns.map(() => 0),
      quiet: quietStretches(on),
    }
  })
  const acts = plan.hasActs
    ? plan.groups
        .filter((group) => group.chapters.length > 0)
        .map((group) => ({ key: group.key, label: actLabel(group, true), span: group.chapters.length }))
    : []
  return { columns, acts, characters, threads }
}

/** Where a stretch is, for people: "chapters 3–5". */
export function stretchLabel(stretch: QuietStretch, columns: readonly PlanChapter[]): string {
  const from = columns[stretch.from]?.number
  const to = columns[stretch.to]?.number
  return from === to ? `chapter ${from}` : `chapters ${from}–${to}`
}
