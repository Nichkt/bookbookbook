import { generateKeyBetween } from "fractional-indexing"
import { ChangeSet } from "@/db/changes"
import { groupChapters, keysForInsert, sortByPosition, type ChapterGroup } from "@/db/order"
import type { ActRow, BeatRow, ChapterRow, EntityLinkRow, LinkRole, SceneRow } from "@/db/schema"
import { insertRow, updateRow, type Db, type SqlValue, type Tx } from "@/db/tx"
import { newId } from "@/lib/id"
import { parseStringList, uniqueStrings } from "@/lib/json"

/*
 * Planner edits (DESIGN.md §6). Each runs in one transaction. Structural ones (fold, split, delete) return the
 * ChangeSet that undoes them; the UI offers it as an Undo toast.
 */

export const DEFAULT_CHAPTER_TARGET = 3000

const timestamp = () => new Date().toISOString()

const CHAPTER_FIELDS = [
  "title",
  "summary",
  "status",
  "pov_entry_id",
  "word_target",
  "labels",
  "template_beat_key",
  "location_entry_id",
  "story_time",
  "notes",
] as const
export type ChapterPatch = Partial<Pick<ChapterRow, (typeof CHAPTER_FIELDS)[number]>>

const SCENE_FIELDS = ["title", "summary", "pov_entry_id", "story_time"] as const
export type ScenePatch = Partial<Pick<SceneRow, (typeof SCENE_FIELDS)[number]>>

function pick(patch: object, fields: readonly string[]): Record<string, SqlValue> {
  const values: Record<string, SqlValue> = {}
  for (const field of fields) {
    const value = (patch as Record<string, SqlValue | undefined>)[field]
    if (value !== undefined) values[field] = value
  }
  return values
}

type NewRow = { id: string } & Record<string, SqlValue>
type NewChapterRow = NewRow & Record<"title" | "summary" | "pov_entry_id" | "story_time", SqlValue>

export function newChapterRow(values: NewRow & { book_id: string; position: string }): NewChapterRow {
  return {
    act_id: null,
    title: "",
    summary: "",
    status: "idea",
    pov_entry_id: null,
    word_target: DEFAULT_CHAPTER_TARGET,
    labels: "[]",
    template_beat_key: null,
    location_entry_id: null,
    story_time: null,
    notes: "",
    deleted_at: null,
    ...values,
  }
}

export function newSceneRow(values: NewRow & { chapter_id: string; position: string }): NewRow {
  return {
    title: "",
    summary: "",
    pov_entry_id: null,
    is_implicit: 0,
    story_time: null,
    word_count: 0,
    ai_word_count: 0,
    deleted_at: null,
    ...values,
  }
}

/** Writes the fresh keys `keysForInsert` gave existing rows, capturing them first when the edit is undoable. */
async function writeKeys(tx: Tx, table: string, rekeyed: Map<string, string>, changes?: ChangeSet) {
  if (rekeyed.size === 0) return
  await changes?.captureIds(tx, table, [...rekeyed.keys()])
  for (const [id, position] of rekeyed) await updateRow(tx, table, id, { position })
}

interface Structure {
  acts: ActRow[]
  /** Every chapter of the book, Trash included, in position order. */
  chapters: ChapterRow[]
  /** Chapters outside the Trash, by act in reading order. */
  groups: ChapterGroup<ActRow, ChapterRow>[]
}

async function loadStructure(tx: Tx, bookId: string): Promise<Structure> {
  const acts = sortByPosition(await tx.getAll<ActRow>("SELECT * FROM acts WHERE book_id = ?", [bookId]))
  const chapters = sortByPosition(await tx.getAll<ChapterRow>("SELECT * FROM chapters WHERE book_id = ?", [bookId]))
  return {
    acts,
    chapters,
    groups: groupChapters(
      acts,
      chapters.filter((chapter) => !chapter.deleted_at),
    ),
  }
}

function locate(structure: Structure, chapterId: string) {
  for (const group of structure.groups) {
    const index = group.chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index !== -1) return { group, index }
  }
  return null
}

/** Where new or moved chapters go. Once a book has acts, every chapter belongs to one. */
function targetGroup(structure: Structure, actId: string | null): ChapterGroup<ActRow, ChapterRow> {
  const withActs = structure.groups.filter((group) => group.act)
  if (withActs.length === 0) return structure.groups.find((group) => !group.act) ?? { act: null, chapters: [] }
  return withActs.find((group) => group.act!.id === actId) ?? withActs[withActs.length - 1]
}

const getChapter = (tx: Tx, id: string) => tx.getOptional<ChapterRow>("SELECT * FROM chapters WHERE id = ?", [id])

// ── Chapters ────────────────────────────────────────────────────────────────

export interface ChapterPlacement {
  /** The act; null in a book without acts. */
  actId: string | null
  /** Index among the act's chapters (Trash excluded) once placed. */
  index: number
}

/** Adds a chapter at `index` in the act (default: the end). Returns its id. */
export async function createChapter(
  db: Db,
  bookId: string,
  placement: { actId: string | null; index?: number },
  values: ChapterPatch = {},
): Promise<string> {
  return db.writeTransaction(async (tx) => {
    const structure = await loadStructure(tx, bookId)
    const group = targetGroup(structure, placement.actId)
    const { keys, rekeyed } = keysForInsert(group.chapters, placement.index ?? group.chapters.length)
    await writeKeys(tx, "chapters", rekeyed)
    const id = newId()
    await insertRow(
      tx,
      "chapters",
      newChapterRow({
        id,
        book_id: bookId,
        act_id: group.act?.id ?? null,
        position: keys[0],
        ...pick(values, CHAPTER_FIELDS),
      }),
    )
    return id
  })
}

export async function updateChapter(db: Db, id: string, patch: ChapterPatch) {
  await updateRow(db, "chapters", id, pick(patch, CHAPTER_FIELDS))
}

/** Moves a chapter to `index` within an act, which may be another act. */
export async function moveChapter(db: Db, id: string, placement: ChapterPlacement) {
  await db.writeTransaction(async (tx) => {
    const chapter = await getChapter(tx, id)
    if (!chapter?.book_id || chapter.deleted_at) return
    const structure = await loadStructure(tx, chapter.book_id)
    const group = targetGroup(structure, placement.actId)
    const siblings = group.chapters.filter((sibling) => sibling.id !== id)
    const index = Math.max(0, Math.min(placement.index, siblings.length))
    const current = locate(structure, id)
    if (current?.group === group && current.index === index) return
    const { keys, rekeyed } = keysForInsert(siblings, index)
    await writeKeys(tx, "chapters", rekeyed)
    await updateRow(tx, "chapters", id, { act_id: group.act?.id ?? null, position: keys[0] })
  })
}

export async function trashChapter(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "chapters", [id])
    await updateRow(tx, "chapters", id, { deleted_at: timestamp() })
    return changes
  })
}

export async function restoreChapter(db: Db, id: string) {
  await db.writeTransaction((tx) => restoreChapterIn(tx, id))
}

async function restoreChapterIn(tx: Tx, id: string) {
  const chapter = await getChapter(tx, id)
  if (!chapter?.book_id || !chapter.deleted_at) return
  const structure = await loadStructure(tx, chapter.book_id)
  const values: Record<string, SqlValue> = { deleted_at: null }
  const actExists = structure.acts.some((act) => act.id === chapter.act_id)
  if (!actExists && (chapter.act_id !== null || structure.acts.length > 0)) {
    // Its act was deleted meanwhile, so it comes back at the end of the book.
    const group = targetGroup(structure, null)
    const { keys, rekeyed } = keysForInsert(group.chapters, group.chapters.length)
    await writeKeys(tx, "chapters", rekeyed)
    values.act_id = group.act?.id ?? null
    values.position = keys[0]
  }
  await updateRow(tx, "chapters", id, values)
}

// ── Scenes ──────────────────────────────────────────────────────────────────

async function visibleScenes(tx: Tx, chapterId: string) {
  return sortByPosition(
    await tx.getAll<SceneRow>("SELECT * FROM scenes WHERE chapter_id = ? AND deleted_at IS NULL", [chapterId]),
  )
}

/** True when nothing was ever written in the scene. */
async function isPristine(tx: Tx, sceneId: string) {
  const { n } = await tx.get<{ n: number }>(
    `SELECT (SELECT count(*) FROM scene_updates WHERE scene_id = ?) + (SELECT count(*) FROM snapshots WHERE scene_id = ?)
       AS n`,
    [sceneId, sceneId],
  )
  return n === 0
}

/**
 * Adds a scene at `index` (default: the end) and returns its id. A chapter written as one implicit scene gets
 * real scenes: its text so far becomes the first one, or, if nothing was written, the implicit scene itself
 * becomes the new scene.
 */
export async function createScene(
  db: Db,
  chapterId: string,
  options: { index?: number; title?: string } = {},
): Promise<string> {
  return db.writeTransaction(async (tx) => {
    const scenes = await visibleScenes(tx, chapterId)
    const title = options.title ?? ""
    if (scenes.length === 1 && scenes[0].is_implicit) {
      if (await isPristine(tx, scenes[0].id)) {
        await updateRow(tx, "scenes", scenes[0].id, { is_implicit: 0, title })
        return scenes[0].id
      }
      await updateRow(tx, "scenes", scenes[0].id, { is_implicit: 0 })
    }
    const { keys, rekeyed } = keysForInsert(scenes, options.index ?? scenes.length)
    await writeKeys(tx, "scenes", rekeyed)
    const id = newId()
    await insertRow(tx, "scenes", newSceneRow({ id, chapter_id: chapterId, position: keys[0], title }))
    return id
  })
}

export async function updateScene(db: Db, id: string, patch: ScenePatch) {
  await updateRow(db, "scenes", id, pick(patch, SCENE_FIELDS))
}

/** Moves a scene to `index` within its chapter. */
export async function moveScene(db: Db, id: string, index: number) {
  await db.writeTransaction(async (tx) => {
    const scene = await tx.getOptional<SceneRow>("SELECT * FROM scenes WHERE id = ?", [id])
    if (!scene?.chapter_id || scene.deleted_at) return
    const scenes = await visibleScenes(tx, scene.chapter_id)
    const siblings = scenes.filter((sibling) => sibling.id !== id)
    const target = Math.max(0, Math.min(index, siblings.length))
    if (scenes.findIndex((sibling) => sibling.id === id) === target) return
    const { keys, rekeyed } = keysForInsert(siblings, target)
    await writeKeys(tx, "scenes", rekeyed)
    await updateRow(tx, "scenes", id, { position: keys[0] })
  })
}

export async function trashScene(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "scenes", [id])
    await updateRow(tx, "scenes", id, { deleted_at: timestamp() })
    return changes
  })
}

/** Restores a scene, and its chapter if that is in the Trash too. */
export async function restoreScene(db: Db, id: string) {
  await db.writeTransaction(async (tx) => {
    const scene = await tx.getOptional<SceneRow>("SELECT * FROM scenes WHERE id = ?", [id])
    if (!scene?.chapter_id || !scene.deleted_at) return
    await restoreChapterIn(tx, scene.chapter_id)
    // A chapter emptied by the Trash gets a blank implicit scene when opened; the restored scene replaces it.
    const scenes = await visibleScenes(tx, scene.chapter_id)
    if (scenes.length === 1 && scenes[0].is_implicit && (await isPristine(tx, scenes[0].id))) {
      await tx.execute("DELETE FROM scenes WHERE id = ?", [scenes[0].id])
    }
    await updateRow(tx, "scenes", id, { deleted_at: null })
  })
}

// ── Beats ───────────────────────────────────────────────────────────────────

async function chapterBeats(tx: Tx, chapterId: string) {
  return sortByPosition(
    await tx.getAll<BeatRow>("SELECT * FROM beats WHERE parent_kind = 'chapter' AND parent_id = ?", [chapterId]),
  )
}

export async function addBeat(db: Db, chapterId: string, index?: number, text = ""): Promise<string> {
  return db.writeTransaction(async (tx) => {
    const beats = await chapterBeats(tx, chapterId)
    const { keys, rekeyed } = keysForInsert(beats, index ?? beats.length)
    await writeKeys(tx, "beats", rekeyed)
    const id = newId()
    await insertRow(tx, "beats", {
      id,
      parent_kind: "chapter",
      parent_id: chapterId,
      position: keys[0],
      text,
      done: 0,
      template_beat_key: null,
    })
    return id
  })
}

export async function updateBeat(db: Db, id: string, patch: { text?: string; done?: boolean }) {
  const values: Record<string, SqlValue> = {}
  if (patch.text !== undefined) values.text = patch.text
  if (patch.done !== undefined) values.done = patch.done ? 1 : 0
  await updateRow(db, "beats", id, values)
}

export async function deleteBeat(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "beats", [id])
    await tx.execute("DELETE FROM beats WHERE id = ?", [id])
    return changes
  })
}

export async function moveBeat(db: Db, id: string, index: number) {
  await db.writeTransaction(async (tx) => {
    const beat = await tx.getOptional<BeatRow>("SELECT * FROM beats WHERE id = ?", [id])
    if (!beat?.parent_id) return
    const beats = await chapterBeats(tx, beat.parent_id)
    const siblings = beats.filter((sibling) => sibling.id !== id)
    const target = Math.max(0, Math.min(index, siblings.length))
    if (beats.findIndex((sibling) => sibling.id === id) === target) return
    const { keys, rekeyed } = keysForInsert(siblings, target)
    await writeKeys(tx, "beats", rekeyed)
    await updateRow(tx, "beats", id, { position: keys[0] })
  })
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Chapter-level links the planner edits. POV and location are single-valued columns on the chapter instead. */
export type ChapterLinkRole = Extract<LinkRole, "thread" | "present">

/** Makes the chapter's links for `role` exactly `entryIds`, dropping duplicates left by concurrent edits. */
export async function setChapterLinks(db: Db, chapterId: string, role: ChapterLinkRole, entryIds: readonly string[]) {
  await db.writeTransaction(async (tx) => {
    const chapter = await getChapter(tx, chapterId)
    if (!chapter) return
    const existing = await tx.getAll<EntityLinkRow>(
      "SELECT * FROM entity_links WHERE chapter_id = ? AND scene_id IS NULL AND role = ?",
      [chapterId, role],
    )
    const wanted = new Set(entryIds)
    const kept = new Set<string>()
    for (const link of existing) {
      if (link.entry_id && wanted.has(link.entry_id) && !kept.has(link.entry_id)) kept.add(link.entry_id)
      else await tx.execute("DELETE FROM entity_links WHERE id = ?", [link.id])
    }
    for (const entryId of wanted) {
      if (kept.has(entryId)) continue
      await insertRow(tx, "entity_links", {
        id: newId(),
        book_id: chapter.book_id,
        chapter_id: chapterId,
        scene_id: null,
        entry_id: entryId,
        role,
        source: "manual",
      })
    }
  })
}

// ── Acts ────────────────────────────────────────────────────────────────────

const getActs = async (tx: Tx, bookId: string) =>
  sortByPosition(await tx.getAll<ActRow>("SELECT * FROM acts WHERE book_id = ?", [bookId]))

/**
 * Adds an act at `index` (default: the end) and returns its id. A book has acts for all its chapters or for none,
 * so the first act takes every chapter, Trash included.
 */
export async function createAct(db: Db, bookId: string, options: { index?: number; title?: string } = {}) {
  return db.writeTransaction(async (tx) => {
    const acts = await getActs(tx, bookId)
    const { keys, rekeyed } = keysForInsert(acts, options.index ?? acts.length)
    await writeKeys(tx, "acts", rekeyed)
    const id = newId()
    await insertRow(tx, "acts", { id, book_id: bookId, title: options.title ?? "", position: keys[0] })
    if (acts.length === 0) await tx.execute("UPDATE chapters SET act_id = ? WHERE book_id = ?", [id, bookId])
    return id
  })
}

export async function renameAct(db: Db, id: string, title: string) {
  await updateRow(db, "acts", id, { title })
}

export async function moveAct(db: Db, id: string, index: number) {
  await db.writeTransaction(async (tx) => {
    const act = await tx.getOptional<ActRow>("SELECT * FROM acts WHERE id = ?", [id])
    if (!act?.book_id) return
    const acts = await getActs(tx, act.book_id)
    const siblings = acts.filter((sibling) => sibling.id !== id)
    const target = Math.max(0, Math.min(index, siblings.length))
    if (acts.findIndex((sibling) => sibling.id === id) === target) return
    const { keys, rekeyed } = keysForInsert(siblings, target)
    await writeKeys(tx, "acts", rekeyed)
    await updateRow(tx, "acts", id, { position: keys[0] })
  })
}

/**
 * Moves every chapter of `act` (Trash included) to the start or end of `into`, or out of acts when there is no
 * other act, then deletes `act`.
 */
async function dissolveAct(
  tx: Tx,
  structure: Structure,
  act: ActRow,
  into: ActRow | null,
  at: "start" | "end",
  changes: ChangeSet,
) {
  const moving = structure.chapters.filter((chapter) => chapter.act_id === act.id)
  await changes.captureIds(tx, "acts", [act.id])
  await changes.captureIds(
    tx,
    "chapters",
    moving.map((chapter) => chapter.id),
  )
  if (into) {
    const existing = structure.chapters.filter((chapter) => chapter.act_id === into.id)
    const { keys, rekeyed } = keysForInsert(existing, at === "end" ? existing.length : 0, moving.length)
    await writeKeys(tx, "chapters", rekeyed, changes)
    for (const [index, chapter] of moving.entries()) {
      await updateRow(tx, "chapters", chapter.id, { act_id: into.id, position: keys[index] })
    }
  } else {
    for (const chapter of moving) await updateRow(tx, "chapters", chapter.id, { act_id: null })
  }
  await tx.execute("DELETE FROM acts WHERE id = ?", [act.id])
}

/**
 * Deletes an act. Its chapters join the previous act (or the next, for the first act), and with `trash` they also
 * go to the Trash. Deleting the only act leaves a book without acts.
 */
export async function deleteAct(db: Db, id: string, chapters: "keep" | "trash"): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    const act = await tx.getOptional<ActRow>("SELECT * FROM acts WHERE id = ?", [id])
    if (!act?.book_id) return changes
    const structure = await loadStructure(tx, act.book_id)
    const index = structure.acts.findIndex((candidate) => candidate.id === id)
    if (chapters === "trash") {
      await changes.capture(tx, "chapters", "act_id = ?", [id])
      const stamp = timestamp()
      for (const chapter of structure.chapters) {
        if (chapter.act_id === id && !chapter.deleted_at) {
          await updateRow(tx, "chapters", chapter.id, { deleted_at: stamp })
        }
      }
    }
    const previous = structure.acts[index - 1]
    const next = structure.acts[index + 1]
    await dissolveAct(tx, structure, act, previous ?? next ?? null, previous ? "end" : "start", changes)
    return changes
  })
}

/** Tab on an act: its chapters join the end of the previous act. Null for the first act. */
export async function mergeActIntoPrevious(db: Db, id: string): Promise<{ changes: ChangeSet; actId: string } | null> {
  return db.writeTransaction(async (tx) => {
    const act = await tx.getOptional<ActRow>("SELECT * FROM acts WHERE id = ?", [id])
    if (!act?.book_id) return null
    const structure = await loadStructure(tx, act.book_id)
    const index = structure.acts.findIndex((candidate) => candidate.id === id)
    if (index <= 0) return null
    const changes = new ChangeSet()
    const previous = structure.acts[index - 1]
    await dissolveAct(tx, structure, act, previous, "end", changes)
    return { changes, actId: previous.id }
  })
}

/**
 * Shift+Tab on a chapter: a new act starts there, taking this chapter and the ones after it. A book without acts
 * gets two. Null for the first chapter of an act.
 */
export async function splitActAt(
  db: Db,
  chapterId: string,
): Promise<{ changes: ChangeSet; actId: string } | null> {
  return db.writeTransaction(async (tx) => {
    const chapter = await getChapter(tx, chapterId)
    if (!chapter?.book_id || chapter.deleted_at) return null
    const bookId = chapter.book_id
    const structure = await loadStructure(tx, bookId)
    const spot = locate(structure, chapterId)
    if (!spot || spot.index === 0) return null
    // Chapters whose act vanished in a sync conflict: there's no act to split.
    if (!spot.group.act && structure.acts.length > 0) return null

    const changes = new ChangeSet()
    const acts = [...structure.acts]
    let current = spot.group.act
    if (!current) {
      current = { id: newId(), book_id: bookId, title: "", position: generateKeyBetween(null, null) }
      await insertRow(tx, "acts", current)
      changes.created("acts", current.id)
      await changes.capture(tx, "chapters", "book_id = ?", [bookId])
      await tx.execute("UPDATE chapters SET act_id = ? WHERE book_id = ?", [current.id, bookId])
      acts.push(current)
    }
    const { keys, rekeyed } = keysForInsert(acts, acts.indexOf(current) + 1)
    await writeKeys(tx, "acts", rekeyed, changes)
    const actId = newId()
    await insertRow(tx, "acts", { id: actId, book_id: bookId, title: "", position: keys[0] })
    changes.created("acts", actId)
    const moving = spot.group.chapters.slice(spot.index)
    await changes.captureIds(
      tx,
      "chapters",
      moving.map((row) => row.id),
    )
    for (const row of moving) await updateRow(tx, "chapters", row.id, { act_id: actId })
    return { changes, actId }
  })
}

// ── Fold and split ──────────────────────────────────────────────────────────

const total = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0))

/**
 * Tab on a chapter (DESIGN.md §6): it becomes scenes at the end of the chapter before it in the same act. That
 * chapter's own text becomes its first scene, so Shift+Tab on the folded scene splits it back out. Returns the
 * chapter folded into and the first scene that came from this one. Null for the first chapter of an act.
 */
export async function mergeChapterIntoPrevious(
  db: Db,
  chapterId: string,
): Promise<{ changes: ChangeSet; chapterId: string; sceneId: string } | null> {
  return db.writeTransaction(async (tx) => {
    const b = await getChapter(tx, chapterId)
    if (!b?.book_id || b.deleted_at) return null
    const structure = await loadStructure(tx, b.book_id)
    const spot = locate(structure, chapterId)
    if (!spot || spot.index === 0) return null
    const a = spot.group.chapters[spot.index - 1]

    const changes = new ChangeSet()
    const pair = [a.id, b.id]
    await changes.captureIds(tx, "chapters", pair)
    await changes.capture(tx, "scenes", "chapter_id IN (?, ?)", pair)
    await changes.capture(tx, "beats", "parent_kind = 'chapter' AND parent_id IN (?, ?)", pair)
    await changes.capture(tx, "entity_links", "chapter_id IN (?, ?)", pair)

    const scenesA = sortByPosition(await tx.getAll<SceneRow>("SELECT * FROM scenes WHERE chapter_id = ?", [a.id]))
    const scenesB = sortByPosition(await tx.getAll<SceneRow>("SELECT * FROM scenes WHERE chapter_id = ?", [b.id]))
    const visibleA = scenesA.filter((scene) => !scene.deleted_at)
    const visibleB = scenesB.filter((scene) => !scene.deleted_at)

    // Scenes to append to A, in order: new ones are inserted, existing ones updated.
    const incoming: { id: string; isNew: boolean; values: Record<string, SqlValue> }[] = []
    if (visibleA.length === 0) {
      incoming.push({ id: newId(), isNew: true, values: { title: a.title ?? "" } })
    } else if (visibleA.length === 1 && visibleA[0].is_implicit) {
      await updateRow(tx, "scenes", visibleA[0].id, { is_implicit: 0, title: visibleA[0].title || a.title || "" })
    }

    // A lone scene of B stands in for B, so it inherits B's identity.
    const asB = (scene: SceneRow | null) => ({
      title: scene?.title || b.title || "",
      summary: scene?.summary || b.summary || "",
      pov_entry_id: scene?.pov_entry_id ?? b.pov_entry_id ?? null,
      story_time: scene?.story_time ?? b.story_time ?? null,
    })
    const loneB = visibleB.length === 1 ? visibleB[0] : null
    const sceneId = visibleB[0]?.id ?? newId()
    if (visibleB.length === 0) incoming.push({ id: sceneId, isNew: true, values: { ...asB(null), is_implicit: 0 } })
    for (const scene of scenesB) {
      const promote = scene === loneB && Boolean(scene.is_implicit)
      incoming.push({ id: scene.id, isNew: false, values: promote ? { ...asB(scene), is_implicit: 0 } : {} })
    }

    const { keys, rekeyed } = keysForInsert(scenesA, scenesA.length, incoming.length)
    await writeKeys(tx, "scenes", rekeyed)
    for (const [index, item] of incoming.entries()) {
      const values = { ...item.values, chapter_id: a.id, position: keys[index] }
      if (item.isNew) {
        changes.created("scenes", item.id)
        await insertRow(tx, "scenes", newSceneRow({ id: item.id, ...values }))
      } else {
        await updateRow(tx, "scenes", item.id, values)
      }
    }

    const beatsA = await chapterBeats(tx, a.id)
    const beatsB = await chapterBeats(tx, b.id)
    const beatKeys = keysForInsert(beatsA, beatsA.length, beatsB.length)
    await writeKeys(tx, "beats", beatKeys.rekeyed)
    for (const [index, beat] of beatsB.entries()) {
      await updateRow(tx, "beats", beat.id, { parent_id: a.id, position: beatKeys.keys[index] })
    }

    const links = await tx.getAll<EntityLinkRow>(
      "SELECT * FROM entity_links WHERE chapter_id IN (?, ?) AND scene_id IS NULL",
      pair,
    )
    const have = new Set(links.filter((link) => link.chapter_id === a.id).map((link) => `${link.role}:${link.entry_id}`))
    for (const link of links.filter((candidate) => candidate.chapter_id === b.id)) {
      const key = `${link.role}:${link.entry_id}`
      if (have.has(key)) await tx.execute("DELETE FROM entity_links WHERE id = ?", [link.id])
      have.add(key)
    }
    await tx.execute("UPDATE entity_links SET chapter_id = ? WHERE chapter_id = ?", [a.id, b.id])

    // B's summary survives on its stand-in scene; otherwise it goes to the notes with B's own notes.
    const standInSummary =
      visibleB.length === 0 ? b.summary : loneB?.is_implicit ? asB(loneB).summary : (loneB?.summary ?? null)
    const summaryKept = !b.summary || standInSummary === b.summary
    const carried = [summaryKept ? "" : (b.summary ?? ""), b.notes ?? ""].map((text) => text.trim()).filter(Boolean)
    const notes = carried.length
      ? [(a.notes ?? "").trim(), `— From “${b.title || "Untitled chapter"}” —`, ...carried].filter(Boolean).join("\n\n")
      : a.notes

    await updateRow(tx, "chapters", a.id, {
      word_target: total(a.word_target, b.word_target),
      labels: JSON.stringify(uniqueStrings([...parseStringList(a.labels), ...parseStringList(b.labels)])),
      notes,
      pov_entry_id: a.pov_entry_id ?? b.pov_entry_id,
      location_entry_id: a.location_entry_id ?? b.location_entry_id,
      template_beat_key: a.template_beat_key || b.template_beat_key || null,
      story_time: a.story_time ?? b.story_time,
    })
    await tx.execute("DELETE FROM chapters WHERE id = ?", [b.id])
    return { changes, chapterId: a.id, sceneId }
  })
}

/** Splits a word target by share, in round numbers. */
export function splitTarget(target: number | null, share: number): [kept: number | null, moved: number | null] {
  if (target === null) return [null, null]
  const step = target >= 1000 ? 50 : 1
  const moved = Math.min(target, Math.max(0, Math.round((target * share) / step) * step))
  return [target - moved, moved]
}

/**
 * A chapter left with one scene that only repeats the chapter goes back to being written as one text, which is
 * what Shift+Tab after Tab should restore.
 */
async function collapseLoneScene(
  tx: Tx,
  chapter: Partial<Record<"title" | "summary" | "pov_entry_id" | "story_time", SqlValue>>,
  scenes: SceneRow[],
) {
  if (scenes.length !== 1 || scenes[0].is_implicit) return
  const [scene] = scenes
  const repeats = (own: string | null, chapterValue: SqlValue | undefined) => !own || own === chapterValue
  if (
    repeats(scene.title, chapter.title) &&
    repeats(scene.summary, chapter.summary) &&
    repeats(scene.pov_entry_id, chapter.pov_entry_id) &&
    repeats(scene.story_time, chapter.story_time)
  ) {
    await updateRow(tx, "scenes", scene.id, { is_implicit: 1, title: "", summary: "" })
  }
}

/**
 * Shift+Tab on a scene: it and the scenes after it become a new chapter right after this one. Null for the first
 * scene.
 */
export async function splitChapterAt(
  db: Db,
  sceneId: string,
): Promise<{ changes: ChangeSet; chapterId: string } | null> {
  return db.writeTransaction(async (tx) => {
    const scene = await tx.getOptional<SceneRow>("SELECT * FROM scenes WHERE id = ?", [sceneId])
    if (!scene?.chapter_id || scene.deleted_at) return null
    const chapter = await getChapter(tx, scene.chapter_id)
    if (!chapter?.book_id || chapter.deleted_at) return null
    const scenes = await visibleScenes(tx, chapter.id)
    const index = scenes.findIndex((candidate) => candidate.id === sceneId)
    if (index <= 0) return null
    const kept = scenes.slice(0, index)
    const moved = scenes.slice(index)

    const changes = new ChangeSet()
    await changes.captureIds(tx, "chapters", [chapter.id])
    await changes.capture(tx, "scenes", "chapter_id = ?", [chapter.id])

    const structure = await loadStructure(tx, chapter.book_id)
    const spot = locate(structure, chapter.id)!
    const { keys, rekeyed } = keysForInsert(spot.group.chapters, spot.index + 1)
    await writeKeys(tx, "chapters", rekeyed, changes)

    const words = (list: SceneRow[]) => list.reduce((sum, row) => sum + (row.word_count ?? 0), 0)
    const share = words(scenes) > 0 ? words(moved) / words(scenes) : moved.length / scenes.length
    const [keptTarget, movedTarget] = splitTarget(chapter.word_target, share)

    const newChapter = newChapterRow({
      id: newId(),
      book_id: chapter.book_id,
      act_id: chapter.act_id,
      position: keys[0],
      title: scene.title ?? "",
      summary: moved.length === 1 ? (scene.summary ?? "") : "",
      status: chapter.status,
      pov_entry_id: scene.pov_entry_id ?? chapter.pov_entry_id,
      word_target: movedTarget,
      labels: chapter.labels ?? "[]",
      location_entry_id: chapter.location_entry_id,
      story_time: scene.story_time,
    })
    changes.created("chapters", newChapter.id)
    await insertRow(tx, "chapters", newChapter)
    await updateRow(tx, "chapters", chapter.id, { word_target: keptTarget })
    for (const row of moved) await updateRow(tx, "scenes", row.id, { chapter_id: newChapter.id })

    // Who's present and which threads run carry on into the new chapter; beats and notes stay.
    const links = await tx.getAll<EntityLinkRow>(
      "SELECT * FROM entity_links WHERE chapter_id = ? AND scene_id IS NULL AND role IN ('thread', 'present')",
      [chapter.id],
    )
    for (const link of links) {
      const id = newId()
      changes.created("entity_links", id)
      await insertRow(tx, "entity_links", { ...link, id, chapter_id: newChapter.id })
    }

    await collapseLoneScene(tx, chapter, kept)
    await collapseLoneScene(tx, newChapter, moved)
    return { changes, chapterId: newChapter.id }
  })
}
