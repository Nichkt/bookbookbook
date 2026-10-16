import { groupChapters } from "@/db/order"
import type { ActListRow, ChapterListRow } from "@/db/queries"
import { actLabel } from "@/features/plan/status"

export interface NavChapter {
  chapter: ChapterListRow
  /** 1-based, in reading order across the book, as the Plan numbers them. */
  number: number
}

export interface NavGroup {
  key: string
  /** The act's heading; null in a book without acts. */
  label: string | null
  chapters: NavChapter[]
}

/**
 * The Write navigator's chapters under their acts, grouped and labelled as the Plan does it. Acts without chapters
 * are left out (there's nothing to open), but still count for the "Act 2" an untitled act is called.
 */
export function navGroups(acts: readonly ActListRow[], chapters: readonly ChapterListRow[]): NavGroup[] {
  const hasActs = acts.length > 0
  let number = 0
  return groupChapters(acts, chapters)
    .map((group, index) => ({
      key: group.act?.id ?? "loose",
      label: hasActs ? actLabel({ act: group.act, index }, hasActs) : null,
      chapters: group.chapters.map((chapter) => ({ chapter, number: ++number })),
    }))
    .filter((group) => group.chapters.length > 0)
}
