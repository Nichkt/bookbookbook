import { generateNKeysBetween } from "fractional-indexing"
import { groupChapters, sortByPosition } from "@/db/order"
import type { ActRow, ChapterRow, SceneRow } from "@/db/schema"
import { insertRow, type Db } from "@/db/tx"
import { newChapterRow } from "@/features/plan/mutations"

export interface SceneSpec {
  title?: string
  implicit?: boolean
  summary?: string
  pov?: string
  time?: string
  words?: number
  /** Gives the scene saved text (a snapshot), so it isn't pristine. */
  written?: boolean
  deleted?: boolean
}

export interface ChapterSpec {
  title: string
  summary?: string
  status?: string
  pov?: string
  location?: string
  time?: string
  target?: number | null
  labels?: string[]
  notes?: string
  beats?: string[]
  threads?: string[]
  present?: string[]
  scenes?: SceneSpec[]
  deleted?: boolean
}

export type BookSpec = { acts: { title: string; chapters: ChapterSpec[] }[] } | { chapters: ChapterSpec[] }

/**
 * Builds a book with readable ids: `act-<title>`, `ch-<title>`, `sc-<chapter>-<n>` (1-based), `beat-<chapter>-<n>`.
 */
export async function buildBook(db: Db, spec: BookSpec, bookId = "book") {
  if (!(await db.getOptional("SELECT id FROM universes WHERE id = 'universe'"))) {
    await insertRow(db, "universes", { id: "universe", name: "Test" })
  }
  await insertRow(db, "books", { id: bookId, universe_id: "universe", title: "Test book" })
  const groups = "acts" in spec ? spec.acts : [{ title: null, chapters: spec.chapters }]
  const actKeys = generateNKeysBetween(null, null, groups.length)
  for (const [groupIndex, group] of groups.entries()) {
    const actId = group.title === null ? null : `act-${group.title}`
    if (actId) await insertRow(db, "acts", { id: actId, book_id: bookId, title: group.title, position: actKeys[groupIndex] })
    const chapterKeys = generateNKeysBetween(null, null, group.chapters.length)
    for (const [chapterIndex, chapter] of group.chapters.entries()) {
      const chapterId = `ch-${chapter.title}`
      await insertRow(
        db,
        "chapters",
        newChapterRow({
          id: chapterId,
          book_id: bookId,
          act_id: actId,
          position: chapterKeys[chapterIndex],
          title: chapter.title,
          summary: chapter.summary ?? "",
          status: chapter.status ?? "idea",
          pov_entry_id: chapter.pov ?? null,
          location_entry_id: chapter.location ?? null,
          story_time: chapter.time ?? null,
          word_target: chapter.target === undefined ? 3000 : chapter.target,
          labels: JSON.stringify(chapter.labels ?? []),
          notes: chapter.notes ?? "",
          deleted_at: chapter.deleted ? "2024-01-01T00:00:00.000Z" : null,
        }),
      )
      const beatKeys = generateNKeysBetween(null, null, chapter.beats?.length ?? 0)
      for (const [beatIndex, text] of (chapter.beats ?? []).entries()) {
        await insertRow(db, "beats", {
          id: `beat-${chapter.title}-${beatIndex + 1}`,
          parent_kind: "chapter",
          parent_id: chapterId,
          position: beatKeys[beatIndex],
          text,
          done: 0,
        })
      }
      for (const [role, entries] of [
        ["thread", chapter.threads],
        ["present", chapter.present],
      ] as const) {
        for (const entry of entries ?? []) {
          await insertRow(db, "entity_links", {
            id: `link-${chapter.title}-${role}-${entry}`,
            book_id: bookId,
            chapter_id: chapterId,
            scene_id: null,
            entry_id: entry,
            role,
            source: "manual",
          })
        }
      }
      const scenes = chapter.scenes ?? []
      const sceneKeys = generateNKeysBetween(null, null, scenes.length)
      for (const [sceneIndex, scene] of scenes.entries()) {
        const sceneId = `sc-${chapter.title}-${sceneIndex + 1}`
        await insertRow(db, "scenes", {
          id: sceneId,
          chapter_id: chapterId,
          position: sceneKeys[sceneIndex],
          title: scene.title ?? "",
          summary: scene.summary ?? "",
          pov_entry_id: scene.pov ?? null,
          is_implicit: scene.implicit ? 1 : 0,
          story_time: scene.time ?? null,
          word_count: scene.words ?? 0,
          ai_word_count: 0,
          deleted_at: scene.deleted ? "2024-01-01T00:00:00.000Z" : null,
        })
        if (scene.written) {
          await insertRow(db, "snapshots", {
            id: `snap-${sceneId}`,
            scene_id: sceneId,
            state_b64: "",
            word_count: scene.words ?? 0,
            kind: "compaction",
            created_at: "2024-01-01T00:00:00.000Z",
          })
        }
      }
    }
  }
}

/**
 * The book outside the Trash as lines: `# Act` headings, then `Chapter: scene, scene`. An implicit scene shows as
 * `~`, an untitled one as `?`.
 */
export async function outline(db: Db, bookId = "book"): Promise<string[]> {
  const acts = await db.getAll<ActRow>("SELECT * FROM acts WHERE book_id = ?", [bookId])
  const chapters = await db.getAll<ChapterRow>("SELECT * FROM chapters WHERE book_id = ? AND deleted_at IS NULL", [
    bookId,
  ])
  const lines: string[] = []
  for (const group of groupChapters(acts, chapters)) {
    if (group.act) lines.push(`# ${group.act.title || "?"}`)
    for (const chapter of group.chapters) {
      const scenes = sortByPosition(
        await db.getAll<SceneRow>("SELECT * FROM scenes WHERE chapter_id = ? AND deleted_at IS NULL", [chapter.id]),
      )
      const names = scenes.map((scene) => (scene.is_implicit ? "~" : scene.title || "?"))
      lines.push(`${chapter.title || "?"}${names.length ? `: ${names.join(", ")}` : ""}`)
    }
  }
  return lines
}

/** Every row of the planner's tables, for exact before/after comparisons. */
export async function dump(db: Db) {
  const tables = ["acts", "chapters", "scenes", "beats", "entity_links", "snapshots"]
  return Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await db.getAll(`SELECT * FROM ${table} ORDER BY id`)])),
  )
}

export const chapterRow = (db: Db, id: string) => db.get<ChapterRow>("SELECT * FROM chapters WHERE id = ?", [id])
export const sceneRow = (db: Db, id: string) => db.get<SceneRow>("SELECT * FROM scenes WHERE id = ?", [id])
