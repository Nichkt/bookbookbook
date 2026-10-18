import { groupChapters } from "@/db/order"
import type { Db } from "@/db/tx"
import { EMPTY_MATCHER, type MentionMatcher } from "@/editor/mentions"
import { blocksText } from "@/export/blocks"
import { loadManuscript } from "@/export/manuscript"
import type { SceneReader } from "@/export/scenes"

/*
 * Appears in (DESIGN.md §7): the chapters an entry turns up in, in reading order. The prose counts wherever the
 * editor underlines the entry's name or an alias. The plan counts where the entry is the POV of the chapter or one of
 * its scenes, its location, one of its threads, or among those present.
 */

export type PlanRole = "pov" | "location" | "thread" | "present"

export const PLAN_ROLES: readonly { role: PlanRole; label: string }[] = [
  { role: "pov", label: "Point of view" },
  { role: "location", label: "Location" },
  { role: "thread", label: "Story point" },
  { role: "present", label: "Present" },
]

const isPlanRole = (role: string): role is PlanRole => PLAN_ROLES.some((option) => option.role === role)

export interface Appearance {
  chapterId: string
  /** The planner's numbering. */
  number: number
  /** As typed, trimmed: may be empty. */
  title: string
  mentions: number
  /** In PLAN_ROLES order. */
  roles: PlanRole[]
}

/** Mentions in the prose by entry, then by chapter. */
export type MentionCounts = ReadonlyMap<string, ReadonlyMap<string, number>>

/** Counts every entry's mentions in the book's stored prose. Flush open editors first to count the last keystroke. */
export async function countMentions(
  db: Db,
  bookId: string,
  matcher: MentionMatcher,
  readScene: SceneReader,
): Promise<MentionCounts> {
  const counts = new Map<string, Map<string, number>>()
  if (matcher === EMPTY_MATCHER) return counts
  const manuscript = await loadManuscript(db, bookId, readScene)
  for (const chapter of manuscript.chapters) {
    // One block per line, and no name spans a line, so this finds what the editor finds block by block.
    for (const match of matcher.find(blocksText(chapter.blocks))) {
      let byChapter = counts.get(match.entryId)
      if (!byChapter) counts.set(match.entryId, (byChapter = new Map()))
      byChapter.set(chapter.id, (byChapter.get(chapter.id) ?? 0) + 1)
    }
  }
  return counts
}

export interface AppearanceActRow {
  id: string
  position: string | null
}

export const APPEARANCE_ACTS_SQL = "SELECT id, position FROM acts WHERE book_id = ?"

export interface AppearanceChapterRow {
  id: string
  act_id: string | null
  position: string | null
  title: string | null
}

export const APPEARANCE_CHAPTERS_SQL =
  "SELECT id, act_id, position, title FROM chapters WHERE book_id = ? AND deleted_at IS NULL"

export interface PlanLinkRow {
  chapter_id: string
  entry_id: string
  role: string
}

/** The plan's links from chapters to entries. Takes the book id four times. */
export const PLAN_LINKS_SQL = `
  SELECT id AS chapter_id, pov_entry_id AS entry_id, 'pov' AS role FROM chapters
  WHERE book_id = ? AND deleted_at IS NULL AND pov_entry_id IS NOT NULL
  UNION
  SELECT id, location_entry_id, 'location' FROM chapters
  WHERE book_id = ? AND deleted_at IS NULL AND location_entry_id IS NOT NULL
  UNION
  SELECT s.chapter_id, s.pov_entry_id, 'pov' FROM scenes s JOIN chapters c ON c.id = s.chapter_id
  WHERE c.book_id = ? AND c.deleted_at IS NULL AND s.deleted_at IS NULL AND s.pov_entry_id IS NOT NULL
  UNION
  SELECT l.chapter_id, l.entry_id, l.role FROM entity_links l JOIN chapters c ON c.id = l.chapter_id
  WHERE c.book_id = ? AND c.deleted_at IS NULL AND l.scene_id IS NULL AND l.role IN ('thread', 'present')`

/** Where each entry appears, by entry id. Entries that appear nowhere are left out. */
export function buildAppearances(
  acts: readonly AppearanceActRow[],
  chapterRows: readonly AppearanceChapterRow[],
  links: readonly PlanLinkRow[],
  mentions: MentionCounts,
): ReadonlyMap<string, Appearance[]> {
  const rolesByEntry = new Map<string, Map<string, Set<PlanRole>>>()
  for (const link of links) {
    if (!isPlanRole(link.role)) continue
    let byChapter = rolesByEntry.get(link.entry_id)
    if (!byChapter) rolesByEntry.set(link.entry_id, (byChapter = new Map()))
    let roles = byChapter.get(link.chapter_id)
    if (!roles) byChapter.set(link.chapter_id, (roles = new Set()))
    roles.add(link.role)
  }

  const chapters = groupChapters(acts, chapterRows).flatMap((group) => group.chapters)
  const appearances = new Map<string, Appearance[]>()
  for (const entryId of new Set([...rolesByEntry.keys(), ...mentions.keys()])) {
    const list: Appearance[] = []
    for (const [index, chapter] of chapters.entries()) {
      const count = mentions.get(entryId)?.get(chapter.id) ?? 0
      const roles = rolesByEntry.get(entryId)?.get(chapter.id)
      if (count === 0 && !roles) continue
      list.push({
        chapterId: chapter.id,
        number: index + 1,
        title: chapter.title?.trim() ?? "",
        mentions: count,
        roles: PLAN_ROLES.map((option) => option.role).filter((role) => roles?.has(role)),
      })
    }
    if (list.length > 0) appearances.set(entryId, list)
  }
  return appearances
}
