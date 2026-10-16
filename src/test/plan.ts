import { generateNKeysBetween } from "fractional-indexing"
import {
  buildPlan,
  type Plan,
  type PlanActRow,
  type PlanBeatRow,
  type PlanChapterRow,
  type PlanSceneRow,
} from "@/features/plan/planData"
import type { ChapterSpec } from "./book"

export interface PlanSpec {
  acts?: { title: string; chapters: ChapterSpec[] }[]
  /** Chapters in no act: strays, when there are acts. */
  loose?: ChapterSpec[]
}

/**
 * A Plan built in memory from the rows buildBook would write, with the same ids: `act-<title>`, `ch-<title>`,
 * `sc-<chapter>-<n>` and `beat-<chapter>-<n>`. Codex links aren't modeled.
 */
export function planOf(spec: PlanSpec): Plan {
  const acts: PlanActRow[] = []
  const chapters: PlanChapterRow[] = []
  const scenes: PlanSceneRow[] = []
  const beats: PlanBeatRow[] = []
  const groups = [...(spec.acts ?? []), ...(spec.loose ? [{ title: null, chapters: spec.loose }] : [])]
  const actKeys = generateNKeysBetween(null, null, groups.length)
  for (const [groupIndex, group] of groups.entries()) {
    const actId = group.title === null ? null : `act-${group.title}`
    if (actId) acts.push({ id: actId, title: group.title, position: actKeys[groupIndex] })
    const chapterKeys = generateNKeysBetween(null, null, group.chapters.length)
    for (const [chapterIndex, chapter] of group.chapters.entries()) {
      if (chapter.deleted) continue
      const chapterId = `ch-${chapter.title}`
      const sceneSpecs = chapter.scenes ?? []
      const sceneKeys = generateNKeysBetween(null, null, sceneSpecs.length)
      let words = 0
      for (const [sceneIndex, scene] of sceneSpecs.entries()) {
        if (scene.deleted) continue
        words += scene.words ?? 0
        scenes.push({
          id: `sc-${chapter.title}-${sceneIndex + 1}`,
          chapter_id: chapterId,
          position: sceneKeys[sceneIndex],
          title: scene.title ?? "",
          summary: scene.summary ?? "",
          is_implicit: scene.implicit ? 1 : 0,
          word_count: scene.words ?? 0,
        })
      }
      const beatKeys = generateNKeysBetween(null, null, chapter.beats?.length ?? 0)
      for (const [beatIndex, text] of (chapter.beats ?? []).entries()) {
        beats.push({
          id: `beat-${chapter.title}-${beatIndex + 1}`,
          parent_id: chapterId,
          position: beatKeys[beatIndex],
          text,
          done: 0,
        })
      }
      chapters.push({
        id: chapterId,
        act_id: actId,
        position: chapterKeys[chapterIndex],
        title: chapter.title,
        summary: chapter.summary ?? "",
        status: chapter.status ?? "idea",
        pov_entry_id: chapter.pov ?? null,
        word_target: chapter.target === undefined ? 3000 : chapter.target,
        labels: JSON.stringify(chapter.labels ?? []),
        template_beat_key: null,
        location_entry_id: chapter.location ?? null,
        story_time: chapter.time ?? null,
        notes: chapter.notes ?? "",
        words,
      })
    }
  }
  return buildPlan(acts, chapters, scenes, beats, [], [])
}

/** The chapter with buildBook's id for `title`. */
export function chapterOf(plan: Plan, title: string) {
  const chapter = plan.chapterById.get(`ch-${title}`)
  if (!chapter) throw new Error(`No chapter “${title}” in the plan`)
  return chapter
}
