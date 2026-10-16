import { CHAPTER_STATUSES, type ChapterStatus } from "@/db/schema"

/** Chapter statuses (DESIGN.md §6). Always shown as a dot plus the word, never color alone. */
export const STATUS: Record<ChapterStatus, { label: string; dot: string }> = {
  idea: { label: "Idea", dot: "bg-status-idea" },
  outlined: { label: "Outlined", dot: "bg-status-outlined" },
  drafting: { label: "Drafting", dot: "bg-status-drafting" },
  revising: { label: "Revising", dot: "bg-status-revising" },
  done: { label: "Done", dot: "bg-status-done" },
}

export const STATUS_OPTIONS = CHAPTER_STATUSES.map((key) => ({ key, ...STATUS[key] }))

export const isStatus = (value: unknown): value is ChapterStatus => CHAPTER_STATUSES.includes(value as ChapterStatus)

export const statusOf = (status: string | null | undefined) => (isStatus(status) ? STATUS[status] : STATUS.idea)

export const UNTITLED_CHAPTER = "Untitled chapter"
export const UNTITLED_SCENE = "Untitled scene"

export const chapterTitle = (title: string | null | undefined) => title?.trim() || UNTITLED_CHAPTER

/**
 * A group of chapters as headed on screen: the act's title, else "Act 2" by its place among all acts. Chapters
 * outside any act are "Not in an act", or just "Chapters" in a book without acts.
 */
export const actLabel = (group: { act: { title: string | null } | null; index: number }, hasActs: boolean) =>
  group.act ? group.act.title?.trim() || `Act ${group.index + 1}` : hasActs ? "Not in an act" : "Chapters"
