import { useQuery } from "@powersync/react"
import { useMemo } from "react"
import { groupChapters, sortByPosition } from "@/db/order"
import type { Tx } from "@/db/tx"
import { parseStringList } from "@/lib/json"
import { colorFor } from "@/lib/palette"
import { parseStoryTime, type StoryTime } from "./storyTime"

/*
 * Everything the Plan screen shows for one book, from a handful of live queries. Rows only re-emit when they
 * change, so typing in the drawer re-renders the cards that changed, not the whole board.
 */

const KEYED = {
  rowComparator: {
    keyBy: (row: { id: string }) => row.id,
    compareBy: (row: unknown) => JSON.stringify(row),
  },
}

export interface PlanActRow {
  id: string
  title: string | null
  position: string | null
}

const ACTS_SQL = "SELECT id, title, position FROM acts WHERE book_id = ?"

export interface PlanChapterRow {
  id: string
  act_id: string | null
  position: string | null
  title: string | null
  summary: string | null
  status: string | null
  pov_entry_id: string | null
  word_target: number | null
  labels: string | null
  template_beat_key: string | null
  location_entry_id: string | null
  story_time: string | null
  notes: string | null
  words: number
}

const CHAPTERS_SQL = `
  SELECT c.id, c.act_id, c.position, c.title, c.summary, c.status, c.pov_entry_id, c.word_target, c.labels,
    c.template_beat_key, c.location_entry_id, c.story_time, c.notes,
    (SELECT coalesce(sum(s.word_count), 0) FROM scenes s WHERE s.chapter_id = c.id AND s.deleted_at IS NULL) AS words
  FROM chapters c WHERE c.book_id = ? AND c.deleted_at IS NULL`

export interface PlanSceneRow {
  id: string
  chapter_id: string
  position: string | null
  title: string | null
  summary: string | null
  is_implicit: number | null
  word_count: number | null
}

const SCENES_SQL = `
  SELECT s.id, s.chapter_id, s.position, s.title, s.summary, s.is_implicit, s.word_count
  FROM scenes s JOIN chapters c ON c.id = s.chapter_id
  WHERE c.book_id = ? AND c.deleted_at IS NULL AND s.deleted_at IS NULL`

export interface PlanBeatRow {
  id: string
  parent_id: string
  position: string | null
  text: string | null
  done: number | null
}

const BEATS_SQL = `
  SELECT b.id, b.parent_id, b.position, b.text, b.done
  FROM beats b JOIN chapters c ON c.id = b.parent_id
  WHERE b.parent_kind = 'chapter' AND c.book_id = ? AND c.deleted_at IS NULL`

interface PlanLinkRow {
  id: string
  chapter_id: string
  entry_id: string
  role: string
}

const LINKS_SQL = `
  SELECT l.id, l.chapter_id, l.entry_id, l.role
  FROM entity_links l JOIN chapters c ON c.id = l.chapter_id
  WHERE c.book_id = ? AND c.deleted_at IS NULL AND l.scene_id IS NULL AND l.role IN ('thread', 'present')`

interface PlanEntryRow {
  id: string
  name: string | null
  color: string | null
  type_key: string | null
}

const ENTRIES_SQL = `
  SELECT e.id, e.name, e.color, t.key AS type_key
  FROM codex_entries e
    JOIN books b ON b.universe_id = e.universe_id
    LEFT JOIN codex_types t ON t.id = e.type_id
  WHERE b.id = ? AND e.deleted_at IS NULL`

export interface PlanEntry {
  id: string
  name: string
  color: string
  typeKey: string | null
}

export interface PlanChapter extends Readonly<PlanChapterRow> {
  /** 1-based, in reading order across the book. */
  number: number
  groupKey: string
  indexInGroup: number
  /** In order, Trash excluded. */
  scenes: readonly Readonly<PlanSceneRow>[]
  /** The scenes the writer made: none when the chapter is written as one text. */
  explicitScenes: readonly Readonly<PlanSceneRow>[]
  beats: readonly Readonly<PlanBeatRow>[]
  /** Entry ids, sorted by name. */
  threads: string[]
  present: string[]
  labelList: string[]
  time: StoryTime | null
}

export interface PlanGroup {
  /** The act id, or LOOSE_GROUP for chapters outside any act. */
  key: string
  act: Readonly<PlanActRow> | null
  index: number
  chapters: PlanChapter[]
  words: number
  target: number
}

export interface Plan {
  groups: PlanGroup[]
  /** Reading order. */
  chapters: PlanChapter[]
  chapterById: ReadonlyMap<string, PlanChapter>
  entries: ReadonlyMap<string, PlanEntry>
  /** Entries by codex type key, sorted by name. */
  entriesByType: ReadonlyMap<string, PlanEntry[]>
  /** Every label used in the book, for suggestions. */
  labels: string[]
  hasActs: boolean
  words: number
}

export const LOOSE_GROUP = "__loose"

const byName = (a: PlanEntry, b: PlanEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })

function bucket<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

export function buildPlan(
  acts: readonly Readonly<PlanActRow>[],
  chapterRows: readonly Readonly<PlanChapterRow>[],
  sceneRows: readonly Readonly<PlanSceneRow>[],
  beatRows: readonly Readonly<PlanBeatRow>[],
  linkRows: readonly Readonly<PlanLinkRow>[],
  entryRows: readonly Readonly<PlanEntryRow>[],
): Plan {
  const entries = new Map<string, PlanEntry>()
  for (const row of entryRows) {
    const name = row.name?.trim() || "Unnamed"
    entries.set(row.id, { id: row.id, name, color: row.color || colorFor(name), typeKey: row.type_key })
  }
  const entriesByType = new Map<string, PlanEntry[]>()
  for (const [key, list] of bucket([...entries.values()], (entry) => entry.typeKey ?? "")) {
    entriesByType.set(key, list.sort(byName))
  }

  const scenesByChapter = bucket(sortByPosition(sceneRows), (scene) => scene.chapter_id)
  const beatsByChapter = bucket(sortByPosition(beatRows), (beat) => beat.parent_id)
  const linksByChapter = bucket(linkRows, (link) => link.chapter_id)
  const linked = (chapterId: string, role: string) =>
    [
      ...new Set(
        (linksByChapter.get(chapterId) ?? [])
          .filter((link) => link.role === role && entries.has(link.entry_id))
          .map((link) => link.entry_id),
      ),
    ].sort((a, b) => byName(entries.get(a)!, entries.get(b)!))

  const labels = new Map<string, string>()
  const chapters: PlanChapter[] = []
  const groups = groupChapters(acts, chapterRows).map((group, index): PlanGroup => {
    const key = group.act?.id ?? LOOSE_GROUP
    const members = group.chapters.map((row, indexInGroup): PlanChapter => {
      const scenes = scenesByChapter.get(row.id) ?? []
      const labelList = parseStringList(row.labels)
      for (const label of labelList) if (!labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label)
      const chapter: PlanChapter = {
        ...row,
        number: chapters.length + 1,
        groupKey: key,
        indexInGroup,
        scenes,
        explicitScenes: scenes.filter((scene) => !scene.is_implicit),
        beats: beatsByChapter.get(row.id) ?? [],
        threads: linked(row.id, "thread"),
        present: linked(row.id, "present"),
        labelList,
        time: parseStoryTime(row.story_time),
      }
      chapters.push(chapter)
      return chapter
    })
    return {
      key,
      act: group.act,
      index,
      chapters: members,
      words: members.reduce((sum, chapter) => sum + chapter.words, 0),
      target: members.reduce((sum, chapter) => sum + (chapter.word_target ?? 0), 0),
    }
  })

  return {
    groups,
    chapters,
    chapterById: new Map(chapters.map((chapter) => [chapter.id, chapter])),
    entries,
    entriesByType,
    labels: [...labels.values()].sort((a, b) => a.localeCompare(b)),
    hasActs: acts.length > 0,
    words: chapters.reduce((sum, chapter) => sum + chapter.words, 0),
  }
}

/** The plan read once, outside React. */
export async function readPlan(db: Tx, bookId: string): Promise<Plan> {
  const [acts, chapters, scenes, beats, links, entries] = await Promise.all([
    db.getAll<PlanActRow>(ACTS_SQL, [bookId]),
    db.getAll<PlanChapterRow>(CHAPTERS_SQL, [bookId]),
    db.getAll<PlanSceneRow>(SCENES_SQL, [bookId]),
    db.getAll<PlanBeatRow>(BEATS_SQL, [bookId]),
    db.getAll<PlanLinkRow>(LINKS_SQL, [bookId]),
    db.getAll<PlanEntryRow>(ENTRIES_SQL, [bookId]),
  ])
  return buildPlan(acts, chapters, scenes, beats, links, entries)
}

export function usePlan(bookId: string): { plan: Plan; isLoading: boolean } {
  const acts = useQuery<PlanActRow>(ACTS_SQL, [bookId], KEYED)
  const chapters = useQuery<PlanChapterRow>(CHAPTERS_SQL, [bookId], KEYED)
  const scenes = useQuery<PlanSceneRow>(SCENES_SQL, [bookId], KEYED)
  const beats = useQuery<PlanBeatRow>(BEATS_SQL, [bookId], KEYED)
  const links = useQuery<PlanLinkRow>(LINKS_SQL, [bookId], KEYED)
  const entries = useQuery<PlanEntryRow>(ENTRIES_SQL, [bookId], KEYED)
  const plan = useMemo(
    () => buildPlan(acts.data, chapters.data, scenes.data, beats.data, links.data, entries.data),
    [acts.data, chapters.data, scenes.data, beats.data, links.data, entries.data],
  )
  const isLoading = [acts, chapters, scenes, beats, links, entries].some((query) => query.isLoading)
  return { plan, isLoading }
}
