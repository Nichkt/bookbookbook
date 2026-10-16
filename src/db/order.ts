import { generateNKeysBetween } from "fractional-indexing"

/** A row ordered by a fractional-indexing key (DESIGN.md §5). */
export interface Positioned {
  id: string
  position: string | null
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Same order as SQL's `ORDER BY position, id` with binary collation. */
export const byPosition = (a: Positioned, b: Positioned) => compare(a.position ?? "", b.position ?? "") || compare(a.id, b.id)

export const sortByPosition = <T extends Positioned>(rows: readonly T[]) => [...rows].sort(byPosition)

/**
 * Keys for putting `count` items at `index` among `siblings` (sorted, without the items being placed). Concurrent
 * edits on two devices can leave duplicate keys, and between two equal keys there's no room: then every sibling
 * gets a fresh key too, returned in `rekeyed` for the caller to write.
 */
export function keysForInsert(
  siblings: readonly Positioned[],
  index: number,
  count = 1,
): { keys: string[]; rekeyed: Map<string, string> } {
  const at = Math.max(0, Math.min(index, siblings.length))
  if (siblings.every((sibling) => sibling.position)) {
    try {
      const keys = generateNKeysBetween(siblings[at - 1]?.position ?? null, siblings[at]?.position ?? null, count)
      return { keys, rekeyed: new Map() }
    } catch {
      // Equal or malformed neighbours: fall through and re-key.
    }
  }
  const all = generateNKeysBetween(null, null, siblings.length + count)
  const rekeyed = new Map(siblings.map((sibling, i) => [sibling.id, all[i < at ? i : i + count]]))
  return { keys: all.slice(at, at + count), rekeyed }
}

export interface ChapterGroup<A, C> {
  /** null for chapters outside any act: all of them in a book without acts. */
  act: A | null
  chapters: C[]
}

/**
 * Reading order: acts by position, chapters by position within their act. A book either has acts or doesn't; any
 * chapter whose act is missing goes in a trailing group of its own, so nothing ever disappears.
 */
export function groupChapters<A extends Positioned, C extends Positioned & { act_id: string | null }>(
  acts: readonly A[],
  chapters: readonly C[],
): ChapterGroup<A, C>[] {
  const groups: ChapterGroup<A, C>[] = sortByPosition(acts).map((act) => ({ act, chapters: [] }))
  const byAct = new Map(groups.map((group) => [group.act!.id, group.chapters]))
  const loose: C[] = []
  for (const chapter of sortByPosition(chapters)) {
    ;((chapter.act_id && byAct.get(chapter.act_id)) || loose).push(chapter)
  }
  if (loose.length > 0 || groups.length === 0) groups.push({ act: null, chapters: loose })
  return groups
}
