import { blocksText, type Block } from "@/export/blocks"

/*
 * The book an import will make (DESIGN.md §13), as the writer sees it before importing: chapters in order, each
 * with its scenes, some starting acts, some left out. The splitter makes it; the writer can rename, merge, leave
 * out and start acts; import writes what's left.
 */

export interface DraftScene {
  /** "" for an untitled scene. */
  title: string
  blocks: Block[]
  words: number
}

export interface DraftChapter {
  key: string
  title: string
  scenes: DraftScene[]
  /** The title of the act this chapter starts ("" for an untitled one), or null when it doesn't start one. */
  act: string | null
  /** Left out of the import, as short front matter is to begin with. */
  leftOut: boolean
}

export type Outline = DraftChapter[]

export const chapterWords = (chapter: DraftChapter) => chapter.scenes.reduce((sum, scene) => sum + scene.words, 0)

export interface ImportAct {
  /** null for the chapters of a book without acts. */
  title: string | null
  chapters: DraftChapter[]
}

/**
 * The chapters to import, in their acts. An act that starts at a chapter left out starts at the next one instead;
 * chapters before the first act join it, as in a book with acts every chapter's in one.
 */
export function importGroups(outline: Outline): ImportAct[] {
  const groups: ImportAct[] = []
  let pending: string | null = null
  for (const chapter of outline) {
    if (chapter.act !== null) pending = chapter.act
    if (chapter.leftOut) continue
    if (pending !== null || groups.length === 0) {
      groups.push({ title: pending, chapters: [] })
      pending = null
    }
    groups[groups.length - 1].chapters.push(chapter)
  }
  if (groups.length > 1 && groups[0].title === null) {
    const [loose, first, ...rest] = groups
    return [{ title: first.title, chapters: [...loose.chapters, ...first.chapters] }, ...rest]
  }
  return groups
}

export interface OutlineStats {
  chapters: number
  acts: number
  scenes: number
  words: number
}

/** What import will make. */
export function outlineStats(outline: Outline): OutlineStats {
  const groups = importGroups(outline)
  const chapters = groups.flatMap((group) => group.chapters)
  return {
    chapters: chapters.length,
    acts: groups.filter((group) => group.title !== null).length,
    scenes: chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0),
    words: chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0),
  }
}

export type OutlineRow =
  | { kind: "act"; startKey: string; title: string; number: number }
  /** `number` counts the chapters to import: null for one left out. */
  | { kind: "chapter"; chapter: DraftChapter; index: number; number: number | null }

/** The outline as the preview lists it: the first act heads the list, as chapters before it go into it. */
export function outlineRows(outline: Outline): OutlineRow[] {
  const rows: OutlineRow[] = []
  let acts = 0
  let numbered = 0
  const actRow = (chapter: DraftChapter): OutlineRow => ({
    kind: "act",
    startKey: chapter.key,
    title: chapter.act ?? "",
    number: ++acts,
  })
  const first = outline.find((chapter) => chapter.act !== null)
  if (first) rows.push(actRow(first))
  outline.forEach((chapter, index) => {
    if (chapter.act !== null && chapter !== first) rows.push(actRow(chapter))
    rows.push({ kind: "chapter", chapter, index, number: chapter.leftOut ? null : ++numbered })
  })
  return rows
}

/** The chapter's first words, for a glance at what it is. */
export function openingWords(chapter: DraftChapter, count = 12): string {
  const words: string[] = []
  for (const block of chapter.scenes.flatMap((scene) => scene.blocks)) {
    words.push(...blocksText([block]).split(/\s+/).filter(Boolean))
    if (words.length > count) return `${words.slice(0, count).join(" ")}…`
  }
  return words.join(" ")
}

const change = (outline: Outline, key: string, update: (chapter: DraftChapter) => DraftChapter): Outline =>
  outline.map((chapter) => (chapter.key === key ? update(chapter) : chapter))

export const renameChapter = (outline: Outline, key: string, title: string) =>
  change(outline, key, (chapter) => ({ ...chapter, title }))

export const setLeftOut = (outline: Outline, key: string, leftOut: boolean) =>
  change(outline, key, (chapter) => ({ ...chapter, leftOut }))

export const renameAct = (outline: Outline, startKey: string, title: string) =>
  change(outline, startKey, (chapter) => ({ ...chapter, act: title }))

/** The act gone: its chapters join the act before, or the one after if it was the first. */
export const removeAct = (outline: Outline, startKey: string) =>
  change(outline, startKey, (chapter) => ({ ...chapter, act: null }))

/** A new, untitled act from this chapter on. In a book without acts, the chapters before it make a first act. */
export function startAct(outline: Outline, key: string): Outline {
  const hasActs = outline.some((chapter) => chapter.act !== null)
  return outline.map((chapter, index) =>
    chapter.act === null && (chapter.key === key || (!hasActs && index === 0)) ? { ...chapter, act: "" } : chapter,
  )
}

export type MergeDirection = "up" | "down"

/** A chapter's scenes, to go into another chapter: its title goes to its first scene, if that has none. */
function asScenes(chapter: DraftChapter): DraftScene[] {
  const [first, ...rest] = chapter.scenes
  if (!first) return chapter.title ? [{ title: chapter.title, blocks: [], words: 0 }] : []
  return [first.title || !chapter.title ? first : { ...first, title: chapter.title }, ...rest]
}

/**
 * The chapter merged into the one above or below it, which keeps its title and place in the acts. Merged up, an act
 * the chapter started starts at the chapter after instead, if that doesn't start one of its own.
 */
export function mergeChapter(outline: Outline, key: string, direction: MergeDirection): Outline {
  const index = outline.findIndex((chapter) => chapter.key === key)
  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (index < 0 || targetIndex < 0 || targetIndex >= outline.length) return outline
  const source = outline[index]
  const target = outline[targetIndex]
  const merged: DraftChapter = {
    ...target,
    scenes: direction === "up" ? [...target.scenes, ...asScenes(source)] : [...asScenes(source), ...target.scenes],
    act: direction === "up" ? target.act : (target.act ?? source.act),
    // Merged on purpose: imported if either part was.
    leftOut: target.leftOut && source.leftOut,
  }
  const next = outline.slice()
  const at = Math.min(index, targetIndex)
  next.splice(at, 2, merged)
  const after = next[at + 1]
  if (direction === "up" && source.act !== null && after && after.act === null) next[at + 1] = { ...after, act: source.act }
  return next
}
