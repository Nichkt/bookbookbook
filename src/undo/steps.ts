import { insertRow, updateRow, type SqlValue, type Tx } from "@/db/tx"
import { describe } from "./describe"
import { TRACKED, type Recording, type RecordingContext, type Row, type RowChange } from "./recorder"

/*
 * An edit as Undo keeps it (DESIGN.md §12): the rows it made, deleted and changed, with what each was before and
 * after. Undoing puts back only what's still as the edit left it, so a step undone out of turn, from its toast,
 * can't wipe out what was done since.
 */

export interface StepChange extends RowChange {
  /** For a row changed rather than made or deleted: the columns that changed. Empty otherwise. */
  readonly columns: readonly string[]
}

export interface Step extends RecordingContext {
  readonly id: number
  /** "Changed the status of chapter 3": what Undo and Redo name. */
  label: string
  changes: readonly StepChange[]
  /** When it was done, or last redone. */
  at: number
  /** When it was undone, while it waits to be redone. */
  undoneAt: number
  /** Closed to later edits joining it. */
  sealed: boolean
  /** The toast that offers to undo it, if one does. */
  toastId?: string | number
}

let lastId = 0

export function newStep(context: RecordingContext, label: string, changes: readonly StepChange[]): Step {
  const { bookId, universeId } = context
  return { id: ++lastId, bookId, universeId, label, changes, at: Date.now(), undoneAt: 0, sealed: false }
}

export const same = (a: SqlValue | undefined, b: SqlValue | undefined) => (a ?? null) === (b ?? null)

/** What changes come to: rows made or deleted, and rows changed with the columns that differ. No-ops dropped. */
export function netChanges(changes: Iterable<RowChange>): StepChange[] {
  const net: StepChange[] = []
  for (const { table, id, before, after } of changes) {
    if (!before && !after) continue
    if (!before || !after) {
      net.push({ table, id, before, after, columns: [] })
      continue
    }
    const ignored = TRACKED[table] ?? []
    const columns = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (column) => column !== "id" && !ignored.includes(column) && !same(before[column], after[column]),
    )
    if (columns.length > 0) net.push({ table, id, before, after, columns })
  }
  return net
}

/** What `earlier` then `later` come to together. */
export function compose(earlier: readonly RowChange[], later: readonly RowChange[]): StepChange[] {
  const rows = new Map<string, RowChange>()
  for (const { table, id, before, after } of earlier) rows.set(`${table} ${id}`, { table, id, before, after })
  for (const { table, id, before, after } of later) {
    const seen = rows.get(`${table} ${id}`)
    if (seen) seen.after = after
    else rows.set(`${table} ${id}`, { table, id, before, after })
  }
  return netChanges(rows.values())
}

/** The step for a recorded edit, named; null if it came to nothing, or reached outside the book. */
export async function makeStep(tx: Tx, recording: Recording): Promise<Step | null> {
  const changes = netChanges(recording.changes.values())
  if (changes.length === 0 || !(await inBook(tx, changes, recording))) return null
  return newStep(recording, await describe(tx, changes, recording), changes)
}

/**
 * Whether every row is the book's or its World's. Edits that reach other books are the app's own, like importing
 * one, and Undo in this book shouldn't touch them.
 */
async function inBook(tx: Tx, changes: readonly StepChange[], context: RecordingContext): Promise<boolean> {
  const chapters = new Set<string>()
  const scenes = new Set<string>()
  const known = new Set<string>()
  for (const { table, id, before, after } of changes) {
    for (const row of [before, after]) {
      if (!row) continue
      switch (table) {
        case "books":
          if (row.id !== context.bookId) return false
          break
        case "acts":
        case "chapters":
        case "entity_links":
        case "inbox_notes":
          if (row.book_id !== context.bookId) return false
          known.add(id)
          break
        case "codex_types":
        case "codex_entries":
          if (row.universe_id !== context.universeId) return false
          break
        case "scenes":
          if (typeof row.chapter_id !== "string") return false
          chapters.add(row.chapter_id)
          known.add(id)
          break
        case "beats":
          if (typeof row.parent_id !== "string") return false
          ;(row.parent_kind === "scene" ? scenes : chapters).add(row.parent_id)
          break
        default:
          return false
      }
    }
  }
  const unknownScenes = [...scenes].filter((id) => !known.has(id))
  if (unknownScenes.length > 0) {
    const rows = await tx.getAll<{ chapter_id: string | null }>(
      "SELECT chapter_id FROM scenes WHERE id IN (SELECT value FROM json_each(?))",
      [JSON.stringify(unknownScenes)],
    )
    if (rows.length !== unknownScenes.length) return false
    for (const row of rows) {
      if (!row.chapter_id) return false
      chapters.add(row.chapter_id)
    }
  }
  const unknownChapters = [...chapters].filter((id) => !known.has(id))
  if (unknownChapters.length === 0) return true
  const { n } = await tx.get<{ n: number }>(
    "SELECT count(*) AS n FROM chapters WHERE book_id = ? AND id IN (SELECT value FROM json_each(?))",
    [context.bookId, JSON.stringify(unknownChapters)],
  )
  return n === unknownChapters.length
}

// ── Undoing ─────────────────────────────────────────────────────────────────

/** Rows the writer can bring back from the Trash. */
const TRASHABLE = new Set(["chapters", "scenes", "codex_entries"])

/** What hangs off a row, Trash included: while any of it is there, the row can't simply go. */
const DEPENDENTS: Readonly<Record<string, readonly string[]>> = {
  acts: ["SELECT 1 AS found FROM chapters WHERE act_id = ? LIMIT 1"],
  chapters: [
    "SELECT 1 AS found FROM scenes WHERE chapter_id = ? LIMIT 1",
    "SELECT 1 AS found FROM beats WHERE parent_kind = 'chapter' AND parent_id = ? LIMIT 1",
    "SELECT 1 AS found FROM entity_links WHERE chapter_id = ? LIMIT 1",
  ],
  scenes: [
    "SELECT 1 AS found FROM scene_updates WHERE scene_id = ? LIMIT 1",
    "SELECT 1 AS found FROM snapshots WHERE scene_id = ? LIMIT 1",
    "SELECT 1 AS found FROM comments WHERE scene_id = ? LIMIT 1",
    "SELECT 1 AS found FROM beats WHERE parent_kind = 'scene' AND parent_id = ? LIMIT 1",
    "SELECT 1 AS found FROM entity_links WHERE scene_id = ? LIMIT 1",
  ],
  codex_entries: [
    "SELECT 1 AS found FROM entity_links WHERE entry_id = ? LIMIT 1",
    "SELECT 1 AS found FROM chapters WHERE pov_entry_id = ? LIMIT 1",
    "SELECT 1 AS found FROM chapters WHERE location_entry_id = ? LIMIT 1",
    "SELECT 1 AS found FROM scenes WHERE pov_entry_id = ? LIMIT 1",
  ],
  codex_types: ["SELECT 1 AS found FROM codex_entries WHERE type_id = ? LIMIT 1"],
}

async function hasDependents(tx: Tx, table: string, id: string): Promise<boolean> {
  for (const sql of DEPENDENTS[table] ?? []) if (await tx.getOptional(sql, [id])) return true
  return false
}

const readRow = (tx: Tx, table: string, id: string) =>
  tx.getOptional<Row>(`SELECT * FROM ${table} WHERE id = ?`, [id])

/**
 * Takes a step back: each column it changed goes back to what it was, unless it has changed again since; rows it
 * made go, or to the Trash if something now depends on them or they've been edited since; rows it deleted come back.
 * Counts what couldn't be put back because it had changed since.
 */
export async function revertStep(tx: Tx, step: Pick<Step, "changes">): Promise<{ conflicts: number }> {
  let conflicts = 0
  for (const { table, id, before, after, columns } of step.changes) {
    if (!before || !after) continue
    const current = await readRow(tx, table, id)
    if (!current) {
      conflicts++
      continue
    }
    const values: Record<string, SqlValue> = {}
    for (const column of columns) {
      if (same(current[column], after[column])) values[column] = before[column] ?? null
      else if (!same(current[column], before[column])) conflicts++
    }
    await updateRow(tx, table, id, values)
  }
  // Newest first, so what was made inside something made with it goes before it.
  for (const { table, id, before, after } of [...step.changes].reverse()) {
    if (before || !after) continue
    const current = await readRow(tx, table, id)
    if (!current) continue
    const editedSince = netChanges([{ table, id, before: after, after: current }]).length > 0
    if (TRASHABLE.has(table) && (editedSince || (await hasDependents(tx, table, id)))) {
      if (!current.deleted_at) await updateRow(tx, table, id, { deleted_at: new Date().toISOString() })
    } else if (await hasDependents(tx, table, id)) {
      conflicts++
    } else {
      await tx.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
    }
  }
  for (const { table, id, before, after } of step.changes) {
    if (!before || after) continue
    if (!(await readRow(tx, table, id))) await insertRow(tx, table, before)
  }
  return { conflicts }
}
