import type { MentionMatcher } from "@/editor/mentions"
import { PLAN_ROLES, type PlanRole } from "@/features/codex/appearances"
import { entryFieldLabels, fieldValue, type Codex, type CodexEntry, type CodexType } from "@/features/codex/codexData"
import { formatCount } from "@/lib/numbers"

/*
 * The Codex page of Write's panel (DESIGN.md §7, §8): the entries the chapter names in its prose or links in its
 * plan, then the whole codex by type, and one entry at a time to read while writing.
 */

/** The page's heading: `="list"` on the list, the entry's id on an entry. */
export const CODEX_PANEL_HEADING = "[data-codex-panel-heading]"
export const CODEX_PANEL_LIST_HEADING = '[data-codex-panel-heading="list"]'
export const CODEX_PANEL_SEARCH = "[data-codex-panel-search]"
/** What scrolls the panel: the docked panel, or the sheet. */
export const PANEL_SCROLLER = "[data-write-panel-scroller]"

export interface ChapterLinkRow {
  entry_id: string
  role: string
}

/**
 * The chapter's links to entries in the plan: its POV and its scenes', its location, its threads and who's present,
 * as Appears in counts them. Takes the chapter id four times.
 */
export const CHAPTER_LINKS_SQL = `
  SELECT pov_entry_id AS entry_id, 'pov' AS role FROM chapters WHERE id = ? AND pov_entry_id IS NOT NULL
  UNION
  SELECT location_entry_id, 'location' FROM chapters WHERE id = ? AND location_entry_id IS NOT NULL
  UNION
  SELECT pov_entry_id, 'pov' FROM scenes WHERE chapter_id = ? AND deleted_at IS NULL AND pov_entry_id IS NOT NULL
  UNION
  SELECT entry_id, role FROM entity_links
  WHERE chapter_id = ? AND scene_id IS NULL AND role IN ('thread', 'present')`

const ROLE_LABELS = new Map(PLAN_ROLES.map(({ role, label }) => [role, label]))
const isPlanRole = (role: string): role is PlanRole => ROLE_LABELS.has(role as PlanRole)

/** Mentions in the texts by entry id: the names the editor underlines. */
export function countMentionsIn(texts: readonly string[], matcher: MentionMatcher): Map<string, number> {
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const match of matcher.find(text)) counts.set(match.entryId, (counts.get(match.entryId) ?? 0) + 1)
  }
  return counts
}

export interface ChapterEntry {
  entry: CodexEntry
  /** In PLAN_ROLES order. */
  roles: PlanRole[]
  mentions: number
}

/**
 * The entries in a chapter: those its prose mentions or its plan links. The POV comes first, then the location, then
 * the rest by mentions, most first, and then in the codex's order. Entries in the Trash are left out.
 */
export function chapterEntries(
  codex: Pick<Codex, "entries" | "entryById">,
  mentions: ReadonlyMap<string, number>,
  links: readonly ChapterLinkRow[],
): ChapterEntry[] {
  const roles = new Map<string, Set<PlanRole>>()
  for (const link of links) {
    if (!isPlanRole(link.role)) continue
    let own = roles.get(link.entry_id)
    if (!own) roles.set(link.entry_id, (own = new Set()))
    own.add(link.role)
  }
  const order = new Map(codex.entries.map((entry, index) => [entry.id, index]))
  const items: ChapterEntry[] = []
  for (const id of new Set([...roles.keys(), ...mentions.keys()])) {
    const entry = codex.entryById.get(id)
    const count = mentions.get(id) ?? 0
    const own = roles.get(id)
    if (!entry || (count === 0 && !own)) continue
    items.push({ entry, roles: PLAN_ROLES.map(({ role }) => role).filter((role) => own?.has(role)), mentions: count })
  }
  const rank = (item: ChapterEntry) => {
    if (item.roles.includes("pov")) return 0
    return item.roles.includes("location") ? 1 : 2
  }
  return items.sort(
    (a, b) =>
      rank(a) - rank(b) || b.mentions - a.mentions || (order.get(a.entry.id) ?? 0) - (order.get(b.entry.id) ?? 0),
  )
}

export const mentionsText = (count: number) => `${formatCount(count)} ${count === 1 ? "mention" : "mentions"}`

/** "POV · Present · 4 mentions". */
export function chapterEntryText({ roles, mentions }: Pick<ChapterEntry, "roles" | "mentions">): string {
  const parts = roles.map((role) => ROLE_LABELS.get(role) ?? role)
  if (mentions > 0) parts.push(mentionsText(mentions))
  return parts.join(" · ")
}

export interface TypeGroup {
  /** Null for the entries whose type is gone. */
  type: CodexType | null
  entries: CodexEntry[]
}

/** The codex by type, in the Codex's order of types, with the entries whose type is gone last. Empty types are left out. */
export function typeGroups(codex: Pick<Codex, "types" | "entriesByType">): TypeGroup[] {
  const groups: TypeGroup[] = []
  for (const type of codex.types) {
    const entries = codex.entriesByType.get(type.id)
    if (entries?.length) groups.push({ type, entries })
  }
  const untyped = codex.entriesByType.get("")
  if (untyped?.length) groups.push({ type: null, entries: untyped })
  return groups
}

export interface FilledField {
  label: string
  value: string
}

/** The entry's fields that have something in them, in the order its page lists them. */
export function filledFields(entry: CodexEntry, type: CodexType | undefined): FilledField[] {
  return entryFieldLabels(entry, type).flatMap((label) => {
    const value = fieldValue(entry, label).trim()
    return value ? [{ label, value }] : []
  })
}
