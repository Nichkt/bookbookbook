import { escapePattern, matchesIn } from "@/editor/find"
import type { Plan, PlanChapter, PlanSceneRow } from "@/features/plan/planData"
import { formatCount } from "@/lib/numbers"

/*
 * Find and replace across the book (DESIGN.md §8 "Writing aids"), apart from the screen: the matches in every
 * scene's text in reading order, how the panel lists them, and which one comes next.
 */

/** No more matches than this are found; the panel says there are more. */
export const MATCH_LIMIT = 10_000
/** No more than this are listed, to keep the panel quick. */
export const LIST_LIMIT = 1_000

/** A match by its place among its scene's matches, which the scene's doc and its editor agree on. */
export interface FindTarget {
  sceneId: string
  ordinal: number
}

export interface BookMatch extends FindTarget {
  chapterId: string
  /** The text of the run the match is in, and where in it the match is. */
  text: string
  start: number
  end: number
}

/** Each scene's runs (see `yRuns`) as text, by scene id. */
export type SceneTexts = ReadonlyMap<string, readonly string[]>

export interface BookResults {
  /** In reading order, up to MATCH_LIMIT. */
  matches: BookMatch[]
  /** Whether there are more matches than MATCH_LIMIT. */
  capped: boolean
  /** Whether some scenes aren't read yet, so more may turn up. */
  partial: boolean
}

export function findInBook(plan: Plan, texts: SceneTexts, regex: RegExp, limit = MATCH_LIMIT): BookResults {
  const matches: BookMatch[] = []
  let partial = false
  for (const chapter of plan.chapters) {
    for (const scene of chapter.scenes) {
      const runs = texts.get(scene.id)
      if (!runs) {
        partial = true
        continue
      }
      let ordinal = 0
      for (const text of runs) {
        for (const match of matchesIn(text, regex, limit + 1 - matches.length)) {
          const start = match.index
          const end = start + match[0].length
          matches.push({ sceneId: scene.id, chapterId: chapter.id, ordinal: ordinal++, text, start, end })
        }
        if (matches.length > limit) return { matches: matches.slice(0, limit), capped: true, partial }
      }
    }
  }
  return { matches, capped: false, partial }
}

let last: { plan: Plan; texts: SceneTexts; regex: RegExp; results: BookResults } | null = null

/** findInBook, remembering the last search so the panel and its buttons share one. */
export function bookResults(plan: Plan, texts: SceneTexts, regex: RegExp): BookResults {
  if (last?.plan !== plan || last.texts !== texts || last.regex !== regex) {
    last = { plan, texts, regex, results: findInBook(plan, texts, regex) }
  }
  return last.results
}

/** Every scene's place in reading order. */
export function sceneOrder(plan: Plan): Map<string, number> {
  return new Map(plan.chapters.flatMap((chapter) => chapter.scenes).map((scene, index) => [scene.id, index]))
}

const sameTarget = (a: FindTarget, b: FindTarget) => a.sceneId === b.sceneId && a.ordinal === b.ordinal

/**
 * The index of the match `step` on (1 for the next, -1 for the one before) from `current`, round the book and back.
 * Without a current match, from `place`: a scene, and how many of its matches come before the place. Without
 * either, the first or the last. -1 when there are no matches.
 */
export function stepIndex(
  matches: readonly BookMatch[],
  order: ReadonlyMap<string, number>,
  current: FindTarget | null,
  place: FindTarget | null,
  step: 1 | -1,
): number {
  const count = matches.length
  if (count === 0) return -1
  const from = current ?? place
  if (!from) return step > 0 ? 0 : count - 1
  const at = order.get(from.sceneId) ?? -1
  let index = 0
  while (index < count) {
    const match = matches[index]
    const sceneAt = order.get(match.sceneId) ?? -1
    if (sceneAt > at || (sceneAt === at && match.ordinal >= from.ordinal)) break
    index++
  }
  if (step < 0) return (index - 1 + count) % count
  const onCurrent = !!current && index < count && sameTarget(matches[index], current)
  return (onCurrent ? index + 1 : index) % count
}

export const indexOfTarget = (matches: readonly BookMatch[], target: FindTarget | null) =>
  target ? matches.findIndex((match) => sameTarget(match, target)) : -1

export interface ResultScene {
  scene: Readonly<PlanSceneRow>
  /** Its place in the chapter, for its name. */
  index: number
  matches: BookMatch[]
}

export interface ResultChapter {
  chapter: PlanChapter
  /** All its matches, listed or not. */
  count: number
  scenes: ResultScene[]
}

/** The matches by chapter and scene for the panel's list, which takes the first `limit` of them. */
export function groupResults(plan: Plan, matches: readonly BookMatch[], limit = LIST_LIMIT): ResultChapter[] {
  const chapters: ResultChapter[] = []
  for (const [index, match] of matches.entries()) {
    let group = chapters.at(-1)
    if (group?.chapter.id !== match.chapterId) {
      const chapter = plan.chapterById.get(match.chapterId)
      if (!chapter) continue
      group = { chapter, count: 0, scenes: [] }
      chapters.push(group)
    }
    group.count++
    if (index >= limit) continue
    let scene = group.scenes.at(-1)
    if (scene?.scene.id !== match.sceneId) {
      const sceneIndex = group.chapter.scenes.findIndex((candidate) => candidate.id === match.sceneId)
      if (sceneIndex === -1) continue
      scene = { scene: group.chapter.scenes[sceneIndex], index: sceneIndex, matches: [] }
      group.scenes.push(scene)
    }
    scene.matches.push(match)
  }
  return chapters.filter((group) => group.scenes.length > 0)
}

const matchesText = (count: number) => `${formatCount(count)} ${count === 1 ? "match" : "matches"}`

/** What the panel says about a search: how many matches, in how many chapters, and which one it's on. */
export function findStatus(results: BookResults, currentIndex: number): string {
  const { matches, capped, partial } = results
  if (matches.length === 0) return partial ? "Searching…" : "No matches"
  const of = capped ? `more than ${formatCount(MATCH_LIMIT)}` : formatCount(matches.length)
  const soFar = partial ? " so far" : ""
  if (currentIndex >= 0) return `Match ${formatCount(currentIndex + 1)} of ${of}${soFar}`
  if (capped) return `More than ${matchesText(MATCH_LIMIT)}`
  if (partial) return `${matchesText(matches.length)} so far`
  const chapters = new Set(matches.map((match) => match.chapterId)).size
  return `${matchesText(matches.length)} in ${chapters === 1 ? "1 chapter" : `${formatCount(chapters)} chapters`}`
}

/** No more than this much selected text becomes the search. */
const SEED_LIMIT = 200

/** The search the words selected in the text start, if they can: one line, not too long. */
export function seedQuery(selected: string, pattern: boolean): string | null {
  if (!selected.trim() || selected.includes("\n") || selected.length > SEED_LIMIT) return null
  return pattern ? escapePattern(selected) : selected
}

/** Whether the list names a chapter's scenes over their matches: only when the writer made scenes in it. */
export const namesScenes = (chapter: PlanChapter) => chapter.explicitScenes.length > 0
