import { strFromU8, strToU8, unzipSync, zipSync, type UnzipFileInfo } from "fflate"
import { columnTypes, type SyncableName } from "@/db/schema"
import { localDay } from "@/db/stats"
import { insertRow, type Db, type SqlValue, type Tx } from "@/db/tx"
import { newId } from "@/lib/id"
import { countWords } from "@/lib/words"
import { base64ToBytes, bytesToBase64 } from "@/yjs/base64"
import { proseText } from "@/yjs/prose"
import { contentState, docFromState, isEmptyContent } from "@/yjs/versions"
import { blocksState, docBlocks, tidyBlocks } from "./blocks"
import { ExportError } from "./errors"
import { FILE_TYPES, markdownBook, safeFilename, type ExportFile } from "./files"
import { loadManuscript } from "./manuscript"
import { blocksToMarkdown, markdownToBlocks } from "./markdown"
import type { SceneReader } from "./scenes"

/*
 * Backups (DESIGN.md §13): a zip holding everything a book is made of, so it can be restored on any device, or
 * read without the app.
 *
 *   book.json             the rows: book, universe, acts, chapters, scenes, beats, codex, links, stats, versions
 *   manuscript.md         the whole book, to read
 *   scenes/<id>.ystate    each written scene's prose, exactly (a Yjs state)
 *   scenes/<id>.md        the same as Markdown, which restores when the .ystate is missing
 *   versions/<id>.ystate  named versions' prose
 *
 * Restoring makes a new book, with new ids throughout, so a backup can be restored next to its original.
 */

export const BACKUP_FORMAT = "bookbookbook"
export const BACKUP_VERSION = 1

export const NOT_A_BACKUP = "That file isn't a bookbookbook backup."
export const NEWER_BACKUP = "That backup is from a newer version of bookbookbook. Update the app, then try again."

type Row = Record<string, SqlValue>

interface VersionMeta {
  id: string
  scene_id: string
  kind: string
  label: string | null
  word_count: number | null
  created_at: string | null
}

export interface BackupData {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  book: Row
  universe: Row | null
  acts: Row[]
  chapters: Row[]
  scenes: Row[]
  beats: Row[]
  codexTypes: Row[]
  codexEntries: Row[]
  entityLinks: Row[]
  writingStats: Row[]
  versions: VersionMeta[]
}

const BOOK_SCENES = "SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ?"

/** The book as a backup zip. Trashed chapters and scenes come along, as they'd still be in the Trash. */
export async function backupFile(db: Db, bookId: string, readScene: SceneReader, now = new Date()): Promise<ExportFile> {
  const book = await db.getOptional<Row>("SELECT * FROM books WHERE id = ?", [bookId])
  if (!book) throw new Error(`There's no book ${bookId}.`)
  const universeId = typeof book.universe_id === "string" ? book.universe_id : null
  const all = (sql: string, ...parameters: SqlValue[]) => db.getAll<Row>(sql, parameters)

  const scenes = await all(`SELECT * FROM scenes WHERE id IN (${BOOK_SCENES}) ORDER BY chapter_id, position, id`, bookId)
  const versionRows = await db.getAll<VersionMeta & { state_b64: string | null }>(
    `SELECT id, scene_id, kind, label, word_count, created_at, state_b64 FROM snapshots
     WHERE kind = 'manual' AND scene_id IN (${BOOK_SCENES}) ORDER BY scene_id, created_at, id`,
    [bookId],
  )
  const files: Record<string, Uint8Array> = {}
  const versions: VersionMeta[] = []
  for (const { state_b64, ...meta } of versionRows) {
    try {
      if (state_b64) files[`versions/${meta.id}.ystate`] = base64ToBytes(state_b64)
      versions.push(meta)
    } catch (error) {
      // Skipped, so one bad row can't stop the whole backup.
      console.error(`[backup] Skipped unreadable version ${meta.id}`, error)
    }
  }
  const data: BackupData = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    book,
    universe: universeId ? await db.getOptional<Row>("SELECT * FROM universes WHERE id = ?", [universeId]) : null,
    acts: await all("SELECT * FROM acts WHERE book_id = ? ORDER BY position, id", bookId),
    chapters: await all("SELECT * FROM chapters WHERE book_id = ? ORDER BY position, id", bookId),
    scenes,
    beats: await all(
      `SELECT * FROM beats
       WHERE (parent_kind = 'chapter' AND parent_id IN (SELECT id FROM chapters WHERE book_id = ?))
          OR (parent_kind = 'scene' AND parent_id IN (${BOOK_SCENES}))
       ORDER BY parent_id, position, id`,
      bookId,
      bookId,
    ),
    codexTypes: universeId ? await all("SELECT * FROM codex_types WHERE universe_id = ? ORDER BY id", universeId) : [],
    codexEntries: universeId ? await all("SELECT * FROM codex_entries WHERE universe_id = ? ORDER BY id", universeId) : [],
    entityLinks: await all("SELECT * FROM entity_links WHERE book_id = ? ORDER BY id", bookId),
    writingStats: await all("SELECT * FROM writing_stats WHERE book_id = ? ORDER BY date, id", bookId),
    versions,
  }

  const states = new Map<string, Uint8Array>()
  const chapterTitles = new Map(data.chapters.map((chapter) => [chapter.id, chapter.title]))
  for (const scene of scenes) {
    const id = String(scene.id)
    const state = await readScene(id)
    states.set(id, state)
    const doc = docFromState(state)
    try {
      if (isEmptyContent(doc)) continue
      files[`scenes/${id}.ystate`] = state
      const frontMatter = { id, chapter: chapterTitles.get(scene.chapter_id) ?? null, title: scene.title ?? null }
      const yaml = Object.entries(frontMatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      files[`scenes/${id}.md`] = strToU8(`---\n${yaml.join("\n")}\n---\n\n${blocksToMarkdown(tidyBlocks(docBlocks(doc)))}\n`)
    } finally {
      doc.destroy()
    }
  }
  const manuscript = await loadManuscript(db, bookId, async (id) => states.get(id) ?? readScene(id))
  files["manuscript.md"] = strToU8(markdownBook(manuscript, "number-title"))
  files["book.json"] = strToU8(`${JSON.stringify(data, null, 2)}\n`)

  return {
    name: `${safeFilename(manuscript.title, "Untitled book")} ${localDay(now)}.bookbookbook.zip`,
    type: FILE_TYPES.zip,
    data: zipSync(files),
  }
}

// Restoring

const MAX_JSON_BYTES = 64 * 1024 * 1024
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_ENTRIES = 20_000
const ENTRY = /^(scenes\/[^/]+\.(ystate|md)|versions\/[^/]+\.ystate)$/

/**
 * Unpacks only the files a backup has, within sane sizes, so a stray or hostile zip can't eat the memory or the
 * time. Stored files must be the size they claim, and the files unpacked can't share data: their packed sizes add
 * up to no more than the zip. So the work grows with the zip's size, not with what its directory claims.
 */
function readZip(data: Uint8Array): Map<string, Uint8Array> {
  let entries = 0
  let packed = 0
  let unpacked = 0
  const wanted = (file: UnzipFileInfo) => {
    if (++entries > MAX_ENTRIES) throw new Error("Too many files")
    const limit = file.name === "book.json" ? MAX_JSON_BYTES : ENTRY.test(file.name) ? MAX_FILE_BYTES : 0
    if (!limit || (file.compression !== 0 && file.compression !== 8) || file.originalSize > limit) return false
    if (file.compression === 0 && file.size !== file.originalSize) throw new Error("Bad size")
    packed += file.size
    unpacked += file.originalSize
    if (packed > data.length || unpacked > MAX_TOTAL_BYTES) throw new Error("Too big")
    return true
  }
  try {
    return new Map(Object.entries(unzipSync(data, { filter: wanted })))
  } catch {
    throw new ExportError(NOT_A_BACKUP)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : [])

const idOf = (row: Record<string, unknown>) => (typeof row.id === "string" && row.id ? row.id : null)

/** A value for a column of the given SQL type, from JSON that may have been edited by hand. */
function coerce(value: unknown, type: string): SqlValue {
  if (value === null || value === undefined) return null
  if (type === "TEXT") {
    if (typeof value === "string") return value
    return typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)
  }
  const number = typeof value === "number" ? value : typeof value === "boolean" ? Number(value) : Number(String(value).trim() || NaN)
  if (!Number.isFinite(number)) return null
  return type === "INTEGER" ? Math.trunc(number) : number
}

/** The row's values for the table's columns, and nothing else. */
function columnsOf(table: SyncableName, row: Record<string, unknown>): Row {
  const values: Row = {}
  for (const [column, type] of Object.entries(columnTypes(table))) {
    if (column in row) values[column] = coerce(row[column], type)
  }
  return values
}

/** Restores a backup zip as a new book. Throws an ExportError to show the writer if the file can't be restored. */
export async function restoreBackup(db: Db, zip: Uint8Array, now = new Date()): Promise<{ bookId: string; title: string }> {
  const files = readZip(zip)
  const json = files.get("book.json")
  if (!json) throw new ExportError(NOT_A_BACKUP)
  let backup: unknown
  try {
    backup = JSON.parse(strFromU8(json))
  } catch {
    throw new ExportError(NOT_A_BACKUP)
  }
  if (!isRecord(backup) || backup.format !== BACKUP_FORMAT || typeof backup.version !== "number" || !isRecord(backup.book)) {
    throw new ExportError(NOT_A_BACKUP)
  }
  if (backup.version > BACKUP_VERSION) throw new ExportError(NEWER_BACKUP)
  const book = backup.book
  const universe = isRecord(backup.universe) ? backup.universe : {}

  // Every row gets a new id, and every reference follows it.
  const ids = new Map<string, string>()
  const fresh = (row: Record<string, unknown>) => {
    const id = idOf(row)
    if (id && !ids.has(id)) ids.set(id, newId())
  }
  const tables = {
    codexTypes: records(backup.codexTypes),
    codexEntries: records(backup.codexEntries),
    acts: records(backup.acts),
    chapters: records(backup.chapters),
    scenes: records(backup.scenes),
    beats: records(backup.beats),
    entityLinks: records(backup.entityLinks),
  }
  for (const rows of Object.values(tables)) rows.forEach(fresh)
  const nowIso = now.toISOString()
  const universeId = newId()
  const bookId = newId()

  return db.writeTransaction(async (tx) => {
    const title = await unusedTitle(tx, typeof book.title === "string" && book.title.trim() ? book.title.trim() : "Untitled book")
    const universeName = typeof universe.name === "string" && universe.name.trim() ? universe.name : title
    await insertRow(tx, "universes", { ...columnsOf("universes", universe), id: universeId, owner_id: null, name: universeName })
    await insertRow(tx, "books", {
      ...columnsOf("books", book),
      id: bookId,
      universe_id: universeId,
      owner_id: null,
      title,
      created_at: nowIso,
      deleted_at: null,
    })

    // Rows whose id is missing or repeated, or whose parent didn't come along, are left out.
    const inserted = new Set<string>()
    /** The new id of a row restored already, which a later row refers to. */
    const ref = (table: SyncableName, value: unknown) =>
      typeof value === "string" && inserted.has(`${table}:${value}`) ? ids.get(value)! : null
    const insert = async (table: SyncableName, row: Record<string, unknown>, values: Row) => {
      const id = idOf(row)
      if (!id || inserted.has(`${table}:${id}`)) return
      inserted.add(`${table}:${id}`)
      await insertRow(tx, table, { ...columnsOf(table, row), ...values, id: ids.get(id)! })
    }
    for (const row of tables.codexTypes) await insert("codex_types", row, { universe_id: universeId })
    for (const row of tables.codexEntries) {
      await insert("codex_entries", row, {
        universe_id: universeId,
        type_id: ref("codex_types", row.type_id),
        image_path: null,
      })
    }
    for (const row of tables.acts) await insert("acts", row, { book_id: bookId })
    for (const row of tables.chapters) {
      await insert("chapters", row, {
        book_id: bookId,
        act_id: ref("acts", row.act_id),
        pov_entry_id: ref("codex_entries", row.pov_entry_id),
        location_entry_id: ref("codex_entries", row.location_entry_id),
      })
    }
    for (const row of tables.scenes) {
      const chapterId = ref("chapters", row.chapter_id)
      const id = idOf(row)
      if (!chapterId || !id || inserted.has(`scenes:${id}`)) continue
      const prose = sceneProse(files, id)
      const values = { chapter_id: chapterId, pov_entry_id: ref("codex_entries", row.pov_entry_id), word_count: prose?.words ?? 0 }
      await insert("scenes", row, values)
      if (!prose) continue
      await insertRow(tx, "snapshots", {
        id: newId(),
        scene_id: ids.get(id)!,
        state_b64: bytesToBase64(prose.state),
        word_count: prose.words,
        kind: "compaction",
        created_at: nowIso,
      })
    }
    for (const row of tables.beats) {
      const parent = row.parent_kind === "chapter" ? "chapters" : row.parent_kind === "scene" ? "scenes" : null
      const parentId = parent && ref(parent, row.parent_id)
      if (parentId) await insert("beats", row, { parent_id: parentId })
    }
    for (const row of tables.entityLinks) {
      const entryId = ref("codex_entries", row.entry_id)
      const chapterId = ref("chapters", row.chapter_id)
      const sceneId = ref("scenes", row.scene_id)
      if (!entryId || (row.chapter_id && !chapterId) || (row.scene_id && !sceneId)) continue
      await insert("entity_links", row, { book_id: bookId, entry_id: entryId, chapter_id: chapterId, scene_id: sceneId })
    }

    // Stats rows are `<device>:<book>:<day>`: keep the device, so days from two devices stay apart.
    const statIds = new Set<string>()
    for (const row of records(backup.writingStats)) {
      const values = columnsOf("writing_stats", row)
      if (typeof values.date !== "string" || !values.date) continue
      const device = idOf(row)?.split(":")[0] || "restored"
      const id = `${device}:${bookId}:${values.date}`
      if (statIds.has(id)) continue
      statIds.add(id)
      await insertRow(tx, "writing_stats", { ...values, id, book_id: bookId })
    }

    for (const meta of records(backup.versions)) {
      const id = idOf(meta)
      const sceneId = ref("scenes", meta.scene_id)
      const prose = id && sceneId ? readState(files.get(`versions/${id}.ystate`)) : null
      if (!prose || !sceneId) continue
      await insertRow(tx, "snapshots", {
        id: newId(),
        scene_id: sceneId,
        state_b64: bytesToBase64(prose.state),
        word_count: prose.words,
        label: typeof meta.label === "string" ? meta.label : "",
        kind: meta.kind === "auto" ? "auto" : "manual",
        created_at: typeof meta.created_at === "string" ? meta.created_at : nowIso,
      })
    }
    return { bookId, title }
  })
}

interface Prose {
  state: Uint8Array
  words: number
}

/** A scene's prose from its .ystate, or else its Markdown. Null when there's none. */
function sceneProse(files: Map<string, Uint8Array>, sceneId: string): Prose | null {
  const fromState = readState(files.get(`scenes/${sceneId}.ystate`))
  if (fromState) return fromState
  const markdown = files.get(`scenes/${sceneId}.md`)
  return markdown ? readState(blocksState(markdownToBlocks(strFromU8(markdown)))) : null
}

/** A stored state, checked and tidied into a fresh doc's. Null if it's unreadable or holds no prose. */
function readState(state: Uint8Array | undefined): Prose | null {
  if (!state) return null
  let doc
  try {
    doc = docFromState(state)
  } catch {
    return null
  }
  try {
    return isEmptyContent(doc) ? null : { state: contentState(doc), words: countWords(proseText(doc)) }
  } finally {
    doc.destroy()
  }
}

/** The title, or with "(restored)" after it if a book in the library has it already. */
async function unusedTitle(tx: Tx, title: string): Promise<string> {
  const taken = async (candidate: string) =>
    Boolean(await tx.getOptional("SELECT id FROM books WHERE deleted_at IS NULL AND title = ?", [candidate]))
  if (!(await taken(title))) return title
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${title} (restored)` : `${title} (restored ${n})`
    if (!(await taken(candidate))) return candidate
  }
}
