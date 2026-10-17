import { chapterWords, openingWords, type DraftChapter, type Outline, type OutlineStats } from "@/import/outline"
import { withParagraphing, type ImportSource } from "@/import/read"
import { analyzeManuscript, splitManuscript, suggestDetails, type Analysis, type SplitChoice, type SplitSettings } from "@/import/split"
import type { Paragraphing } from "@/import/text"
import { formatCount } from "@/lib/numbers"

/*
 * The import preview's state (DESIGN.md §13): what was read, how it's split, and the outline as the writer has
 * changed it since. Every change makes a new draft, so Undo is going back to the one before.
 */

export interface Draft {
  source: ImportSource
  analysis: Analysis
  settings: SplitSettings
  outline: Outline
}

/** The draft split again another way. Changes made to the outline go, as Undo can bring them back. */
export function resplit(draft: Draft, settings: SplitSettings): Draft {
  const outline = splitManuscript(draft.source.manuscript.pieces, draft.analysis.titleIndex, settings)
  return { ...draft, settings, outline }
}

/** What was read, split the likeliest way. */
export function draftOf(source: ImportSource): Draft {
  const analysis = analyzeManuscript(source.manuscript.pieces)
  return resplit({ source, analysis, settings: analysis.settings, outline: [] }, analysis.settings)
}

/** Plain text read again with its paragraphs parted another way, then split the likeliest way for that. */
export const reparagraph = (draft: Draft, paragraphing: Paragraphing): Draft =>
  draftOf(withParagraphing(draft.source, paragraphing))

export const PARAGRAPHINGS: readonly { value: Paragraphing; label: string }[] = [
  { value: "blank-lines", label: "Parted by blank lines" },
  { value: "lines", label: "One to a line" },
]

/** The title and author to start with: as the manuscript gives them, else the file's own details, else its name. */
export function suggestedDetails(draft: Draft): { title: string; author: string } {
  const { manuscript, name } = draft.source
  const suggested = suggestDetails(manuscript.pieces, draft.analysis, draft.settings)
  return {
    title: suggested.title || manuscript.title.trim() || name,
    author: suggested.author || manuscript.author.trim(),
  }
}

/** Whether splitting chapters into scenes changes anything, so whether to offer the choice. */
export function scenesMatter({ source, analysis, settings }: Pick<Draft, "source" | "analysis" | "settings">): boolean {
  const scenes = (split: boolean) =>
    splitManuscript(source.manuscript.pieces, analysis.titleIndex, { ...settings, scenes: split }).reduce(
      (sum, chapter) => sum + chapter.scenes.length,
      0,
    )
  return scenes(true) !== scenes(false)
}

/** "1 chapter", "1,204 words". */
export const counted = (count: number, one: string, many = `${one}s`) =>
  `${formatCount(count)} ${count === 1 ? one : many}`

/** A way of splitting, as "Chapters start at" offers it. */
export function choiceLabel(choice: SplitChoice): string {
  const chapters = counted(choice.chapters, "chapter")
  switch (choice.mode.kind) {
    case "headings":
      return `${choice.mode.level === 0 ? "Title headings" : `Heading ${choice.mode.level}`} (${chapters})`
    case "lines":
      return `Lines like “Chapter 1” (${chapters})`
    case "none":
      return "Nowhere: it’s all one chapter"
  }
}

/** What import will make: "24 chapters · 3 acts · 87 scenes · 91,204 words". */
export function statsLabel(stats: OutlineStats): string {
  return [
    counted(stats.chapters, "chapter"),
    stats.acts > 0 ? counted(stats.acts, "act") : "",
    counted(stats.scenes, "scene"),
    counted(stats.words, "word"),
  ]
    .filter(Boolean)
    .join(" · ")
}

/** A chapter at a glance: "Left out · 2,345 words · 3 scenes · The ferry nosed into the slip…". */
export function chapterMeta(chapter: DraftChapter): string {
  const words = chapterWords(chapter)
  return [
    chapter.leftOut ? "Left out" : "",
    words > 0 ? counted(words, "word") : "Empty",
    chapter.scenes.length > 1 ? counted(chapter.scenes.length, "scene") : "",
    openingWords(chapter),
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Where it came from, under the dialog's title. */
export const sourceLabel = (source: ImportSource) =>
  source.kind === "paste" ? "From the text you pasted" : `From “${source.name}”`

/** The draft now, and the ones before it, for Undo. */
export interface History {
  draft: Draft
  past: Draft[]
}

/** How many changes Undo goes back. */
export const UNDO_LIMIT = 100

/** The history with a new draft. A change that's more of the last, like another letter typed, keeps one step for both. */
export function pushDraft(history: History, draft: Draft, coalesce = false): History {
  if (draft === history.draft) return history
  const past = coalesce && history.past.length > 0 ? history.past : [...history.past, history.draft].slice(-UNDO_LIMIT)
  return { draft, past }
}

/** The history a step back. */
export function undoDraft(history: History): History {
  const previous = history.past.at(-1)
  return previous ? { draft: previous, past: history.past.slice(0, -1) } : history
}
