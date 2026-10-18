import { announce, attempt, offerUndo } from "@/app/feedback"
import type { Db } from "@/db/tx"
import {
  deleteAct,
  mergeActIntoPrevious,
  mergeChapterIntoPrevious,
  moveAct,
  moveChapter,
  moveScene,
  splitActAt,
  splitChapterAt,
  trashChapter,
  trashScene,
} from "./mutations"
import type { FocusItem } from "./planContext"
import { LOOSE_GROUP, type Plan, type PlanChapter, type PlanGroup } from "./planData"

/*
 * Structural edits as the Board, Outline and menus run them: the edit, then focus on the item it produced, an Undo
 * toast that puts focus back where it was, and a spoken reason when the edit doesn't apply.
 */

const quoted = (text: string) => `“${text}”`

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "“Ferry wake”", or "chapter 3" when untitled. Lowercase, for the middle of a sentence. */
export const chapterName = (chapter: Pick<PlanChapter, "title" | "number">) =>
  chapter.title?.trim() ? quoted(chapter.title.trim()) : `chapter ${chapter.number}`

/** The act's title, or "act 2" when untitled. */
export const actName = (group: Pick<PlanGroup, "act" | "index">) =>
  group.act?.title?.trim() ? quoted(group.act.title.trim()) : group.act ? `act ${group.index + 1}` : "the book"

const sceneName = (title: string | null | undefined, index: number) =>
  title?.trim() ? quoted(title.trim()) : `scene ${index + 1}`

const groupOf = (plan: Plan, chapter: PlanChapter) => plan.groups.find((group) => group.key === chapter.groupKey)

/**
 * An item as its title field shows it. A key in the field runs its command before the plan has caught up with what
 * was just typed, so the field passes its text along for the messages.
 */
const titled = <T extends { title: string | null }>(item: T, title: string | undefined): T =>
  title === undefined ? item : { ...item, title }

/** The chapter after this one in reading order, else the one before: where focus goes when it leaves. */
export function neighborChapter(plan: Plan, chapterId: string): PlanChapter | undefined {
  const index = plan.chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index === -1) return undefined
  return plan.chapters[index + 1] ?? plan.chapters[index - 1]
}

/** Tab on a chapter: it becomes scenes at the end of the chapter above. */
export async function foldChapter(db: Db, plan: Plan, chapterId: string, focus: FocusItem, title?: string) {
  const found = plan.chapterById.get(chapterId)
  const group = found && groupOf(plan, found)
  if (!found || !group) return
  const chapter = titled(found, title)
  if (chapter.indexInGroup === 0) {
    announce(
      plan.hasActs
        ? `${capitalize(chapterName(chapter))} is the first chapter of its act, so there's no chapter above to fold into.`
        : `${capitalize(chapterName(chapter))} is the first chapter, so there's no chapter above to fold into.`,
    )
    return
  }
  const previous = group.chapters[chapter.indexInGroup - 1]
  const result = await attempt("fold chapter", mergeChapterIntoPrevious(db, chapterId))
  if (!result) return
  focus("scene", result.sceneId)
  const scenes = chapter.scenes.length > 1 ? `${chapter.scenes.length} scenes` : "a scene"
  offerUndo(db, `Folded ${chapterName(chapter)} into ${chapterName(previous)} as ${scenes}`, result.changes, () =>
    focus("chapter", chapterId),
  )
}

/** Shift+Tab on a scene: it and the scenes after it become a new chapter. */
export async function splitChapter(
  db: Db,
  plan: Plan,
  chapterId: string,
  sceneId: string,
  focus: FocusItem,
  title?: string,
) {
  const chapter = plan.chapterById.get(chapterId)
  if (!chapter) return
  const index = chapter.scenes.findIndex((scene) => scene.id === sceneId)
  if (index === -1) return
  const name = sceneName(title ?? chapter.scenes[index].title, index)
  if (index === 0) {
    announce(`${capitalize(name)} already starts its chapter.`)
    return
  }
  const result = await attempt("split chapter", splitChapterAt(db, sceneId))
  if (!result) return
  focus("chapter", result.chapterId)
  offerUndo(db, `Split ${name} off into a new chapter`, result.changes, () => focus("scene", sceneId))
}

/** Tab on an act: its chapters join the end of the act above. */
export async function foldAct(db: Db, plan: Plan, actId: string, focus: FocusItem, title?: string) {
  const found = plan.groups.find((candidate) => candidate.act?.id === actId)
  if (!found?.act) return
  const group = { ...found, act: titled(found.act, title) }
  const previous = plan.groups[group.index - 1]
  if (!previous?.act) {
    announce(`${capitalize(actName(group))} is the first act, so there's no act above to merge into.`)
    return
  }
  const first = group.chapters[0]
  const result = await attempt("merge act", mergeActIntoPrevious(db, actId))
  if (!result) return
  if (first) focus("chapter", first.id)
  else focus("act", result.actId)
  offerUndo(db, `Merged ${actName(group)} into ${actName(previous)}`, result.changes, () => focus("act", actId))
}

/** Shift+Tab on a chapter: a new act starts there. */
export async function splitAct(db: Db, plan: Plan, chapterId: string, focus: FocusItem, title?: string) {
  const found = plan.chapterById.get(chapterId)
  if (!found) return
  const chapter = titled(found, title)
  if (plan.hasActs && chapter.groupKey === LOOSE_GROUP) {
    announce(`${capitalize(chapterName(chapter))} isn't in an act, so there's no act to split. Move it into one first.`)
    return
  }
  if (chapter.indexInGroup === 0) {
    announce(
      plan.hasActs
        ? `${capitalize(chapterName(chapter))} already starts its act.`
        : `${capitalize(chapterName(chapter))} is the first chapter, so a new act can't start there.`,
    )
    return
  }
  const result = await attempt("split act", splitActAt(db, chapterId))
  if (!result) return
  focus("act", result.actId)
  offerUndo(db, `Started a new act at ${chapterName(chapter)}`, result.changes, () => focus("chapter", chapterId))
}

/** Moves a chapter to `index` in `target`, then says where it landed. `focus` is null for pointer drags. */
export async function relocateChapter(
  db: Db,
  plan: Plan,
  chapterId: string,
  target: PlanGroup,
  index: number,
  focus: FocusItem | null,
) {
  const chapter = plan.chapterById.get(chapterId)
  if (!chapter) return
  const count = target.chapters.length + (chapter.groupKey === target.key ? 0 : 1)
  const done = await attempt(
    "move chapter",
    moveChapter(db, chapterId, { actId: target.act?.id ?? null, index }).then(() => true),
  )
  if (!done) return
  focus?.("chapter", chapterId)
  const where = plan.hasActs && target.act ? ` in ${actName(target)}` : ""
  announce(`Moved to position ${index + 1} of ${count}${where}`)
}

export type ChapterStep = "earlier" | "later" | "previousAct" | "nextAct"

const STEP_KEYS: Partial<Record<string, ChapterStep>> = {
  ArrowLeft: "earlier",
  ArrowRight: "later",
  ArrowUp: "previousAct",
  ArrowDown: "nextAct",
}

type StepKeys = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">

/** The move Alt+arrows on a Board or Corkboard card ask for, if that's what was pressed. */
export function cardStep(event: StepKeys): ChapterStep | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  return STEP_KEYS[event.key] ?? null
}

/** Where one keyboard step takes a chapter, or a reason it can't go. Steps cross acts in the Outline. */
export function chapterStepTarget(
  plan: Plan,
  chapter: PlanChapter,
  step: ChapterStep,
  crossActs: boolean,
): { group: PlanGroup; index: number } | string {
  const group = groupOf(plan, chapter)
  if (!group) return "That chapter isn't in the plan."
  const previous = plan.groups[group.index - 1]
  const next = plan.groups[group.index + 1]
  const last = group.chapters.length - 1
  switch (step) {
    case "earlier":
      if (chapter.indexInGroup > 0) return { group, index: chapter.indexInGroup - 1 }
      if (crossActs && previous?.act) return { group: previous, index: previous.chapters.length }
      if (chapter.number === 1) return "Already the first chapter."
      return group.act ? "Already the first chapter of this act." : "Already the first chapter not in an act."
    case "later":
      if (chapter.indexInGroup < last) return { group, index: chapter.indexInGroup + 1 }
      if (crossActs && next?.act) return { group: next, index: 0 }
      if (chapter.number === plan.chapters.length) return "Already the last chapter."
      // Chapters not in an act come last, so any other chapter stopped here is at the end of an act.
      return "Already the last chapter of this act."
    case "previousAct":
      return previous?.act ? { group: previous, index: previous.chapters.length } : "There's no act above."
    case "nextAct":
      return next?.act ? { group: next, index: 0 } : "There's no act below."
  }
}

export async function stepChapter(
  db: Db,
  plan: Plan,
  chapterId: string,
  step: ChapterStep,
  crossActs: boolean,
  focus: FocusItem,
) {
  const chapter = plan.chapterById.get(chapterId)
  if (!chapter) return
  const target = chapterStepTarget(plan, chapter, step, crossActs)
  if (typeof target === "string") {
    announce(target)
    return
  }
  await relocateChapter(db, plan, chapterId, target.group, target.index, focus)
}

export async function moveActBy(db: Db, plan: Plan, actId: string, delta: -1 | 1, focus: FocusItem) {
  const acts = plan.groups.filter((group) => group.act)
  const index = acts.findIndex((group) => group.act!.id === actId)
  if (index === -1) return
  const target = index + delta
  if (target < 0 || target >= acts.length) {
    announce(delta < 0 ? "Already the first act." : "Already the last act.")
    return
  }
  const done = await attempt("move act", moveAct(db, actId, target).then(() => true))
  if (!done) return
  focus("act", actId)
  announce(`Moved to act position ${target + 1} of ${acts.length}`)
}

/** Alt+↑/↓ on a scene: one place up or down within its chapter. */
export async function moveSceneBy(
  db: Db,
  plan: Plan,
  chapterId: string,
  sceneId: string,
  delta: -1 | 1,
  focus: FocusItem,
) {
  const scenes = plan.chapterById.get(chapterId)?.scenes ?? []
  const index = scenes.findIndex((scene) => scene.id === sceneId)
  if (index === -1) return
  const target = index + delta
  if (target < 0 || target >= scenes.length) {
    announce(delta < 0 ? "Already the first scene of this chapter." : "Already the last scene of this chapter.")
    return
  }
  const done = await attempt("move scene", moveScene(db, sceneId, target).then(() => true))
  if (!done) return
  focus("scene", sceneId)
  announce(`Moved to scene ${target + 1} of ${scenes.length}`)
}

export async function trashChapterWithUndo(db: Db, plan: Plan, chapterId: string, focus: FocusItem) {
  const chapter = plan.chapterById.get(chapterId)
  if (!chapter) return
  const neighbor = neighborChapter(plan, chapterId)
  const changes = await attempt("trash chapter", trashChapter(db, chapterId))
  if (!changes) return
  if (neighbor) focus("chapter", neighbor.id)
  offerUndo(db, `Moved ${chapterName(chapter)} to the Trash`, changes, () => focus("chapter", chapterId))
}

export async function trashSceneWithUndo(db: Db, plan: Plan, chapterId: string, sceneId: string, focus: FocusItem) {
  const chapter = plan.chapterById.get(chapterId)
  if (!chapter) return
  const scenes = chapter.explicitScenes
  const index = scenes.findIndex((scene) => scene.id === sceneId)
  if (index === -1) return
  const neighbor = scenes[index + 1] ?? scenes[index - 1]
  const changes = await attempt("trash scene", trashScene(db, sceneId))
  if (!changes) return
  if (neighbor) focus("scene", neighbor.id)
  else focus("chapter", chapterId)
  offerUndo(db, `Moved ${sceneName(scenes[index].title, index)} to the Trash`, changes, () => focus("scene", sceneId))
}

/** Deletes an act. Its chapters join the act above (or below), and with `trash` they go to the Trash too. */
export async function deleteActWithUndo(
  db: Db,
  plan: Plan,
  actId: string,
  mode: "keep" | "trash",
  focus: FocusItem,
) {
  const group = plan.groups.find((candidate) => candidate.act?.id === actId)
  if (!group) return
  const previous = plan.groups[group.index - 1]
  const next = plan.groups[group.index + 1]
  const heir = previous?.act ? previous : next?.act ? next : null
  const changes = await attempt("delete act", deleteAct(db, actId, mode))
  if (!changes) return
  const count = group.chapters.length
  let message: string
  if (mode === "trash" && count > 0) {
    message = `Deleted ${actName(group)} and moved its ${count === 1 ? "chapter" : `${count} chapters`} to the Trash`
    if (heir?.act) focus("act", heir.act.id)
  } else {
    message =
      count > 0 && heir ? `Deleted ${actName(group)}. Its chapters joined ${actName(heir)}.` : `Deleted ${actName(group)}`
    if (count > 0 && mode === "keep") focus("chapter", group.chapters[0].id)
    else if (heir?.act) focus("act", heir.act.id)
  }
  offerUndo(db, message, changes, () => focus("act", actId))
}
