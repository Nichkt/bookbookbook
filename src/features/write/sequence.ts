import type { Plan, PlanChapter, PlanSceneRow } from "@/features/plan/planData"

/** A place in the book's reading order, one scene at a time: a scene, or a chapter with no scene yet. */
export interface SceneStop {
  chapter: PlanChapter
  /** null for a chapter that hasn't been opened: it gets its scene when it is. */
  scene: Readonly<PlanSceneRow> | null
}

/** Every scene in reading order, across chapters. */
export function sceneStops(plan: Plan): SceneStop[] {
  return plan.chapters.flatMap((chapter): SceneStop[] =>
    chapter.scenes.length > 0 ? chapter.scenes.map((scene) => ({ chapter, scene })) : [{ chapter, scene: null }],
  )
}

/** The scene the Scene view shows for a URL: the one named, else the chapter's first. */
export const sceneToShow = (chapter: PlanChapter, sceneId: string | null) =>
  chapter.scenes.find((scene) => scene.id === sceneId) ?? chapter.scenes[0] ?? null

/** The stops either side of a scene (or of a chapter without one), for Previous and Next. */
export function sceneNeighbors(plan: Plan, chapterId: string, sceneId: string | null) {
  const stops = sceneStops(plan)
  const index = stops.findIndex((stop) => stop.chapter.id === chapterId && (stop.scene?.id ?? null) === sceneId)
  return {
    previous: index > 0 ? stops[index - 1] : null,
    next: index === -1 ? null : (stops[index + 1] ?? null),
  }
}

export const stopPath = (bookId: string, stop: SceneStop) =>
  `/b/${bookId}/write/${stop.chapter.id}${stop.scene ? `/${stop.scene.id}` : ""}`

/** Roughly the height of a word on the page (19px Literata, 1.75 leading, about 11 words a line). */
const PX_PER_WORD = 3.2
const MIN_SCENE_PX = 120

/** Space held for a scene whose editor isn't mounted, before it has been measured. */
export const estimatedHeight = (words: number | null | undefined) =>
  Math.max(MIN_SCENE_PX, Math.round((words ?? 0) * PX_PER_WORD))
