import type { Db, SqlValue, Tx } from "@/db/tx"
import type { Step } from "./steps"

/*
 * Undo (DESIGN.md §12) follows the one database rather than each edit. Every write the app makes goes through it, so
 * wrapping its two write methods sees them all: the rows each edit touched, as they were before it and after. The
 * edits are the app's own SQL in three shapes (insertRow, updateRow, and DELETE … WHERE), which is all this reads.
 */

export type Row = { id: string } & Record<string, SqlValue>

/** A row an edit touched. */
export interface RowChange {
  table: string
  id: string
  /** The row before the edit; null when the edit made it. */
  before: Row | null
  /** The row after; null when the edit deleted it. */
  after: Row | null
}

/**
 * The tables Undo puts back, each with the columns it leaves alone: what the app keeps up to date by itself, and a
 * whole book's Trash, which has an Undo of its own.
 */
export const TRACKED: Readonly<Record<string, readonly string[]>> = {
  books: ["deleted_at", "created_at"],
  acts: [],
  chapters: [],
  scenes: ["word_count", "ai_word_count"],
  beats: [],
  codex_types: [],
  codex_entries: [],
  entity_links: [],
  inbox_notes: [],
}

/**
 * Tables Undo doesn't put back that aren't just the app's bookkeeping, unlike the text's saved updates, versions and
 * stats: an edit that writes one isn't offered to Undo at all, rather than half undone.
 */
const UNTRACKABLE = new Set(["universes", "templates", "custom_tools"])

/** The book whose edits are being recorded. */
export interface RecordingContext {
  bookId: string
  /** The book's universe, whose World it edits. */
  universeId: string | null
}

/** What one edit (a transaction, or a single write outside one) did to the tracked tables. */
export interface Recording extends RecordingContext {
  /** By table and id, in the order the edit first touched them. */
  readonly changes: Map<string, RowChange>
  /** Set by skipHistory, or when the edit also wrote what Undo can't put back. */
  skip: boolean
  /** Set by retractEdit. */
  retract: boolean
  /** What the edit comes to for Undo, once it's written. Undefined when it comes to nothing. */
  step?: Step
}

export interface RecorderHooks {
  /** Whose edits to record: the book open. null records nothing. */
  context(): RecordingContext | null
  /** In the edit's transaction, after its writes: the step to undo it, reading what it needs to name it. */
  finish(tx: Tx, recording: Recording): Promise<Step | null>
  /** An edit recorded with `context` has been written, and has a step. */
  recorded(recording: Recording): void
  /** Every write, recorded or not, as it starts and as it ends: for the save status. */
  writeStarted?(): void
  writeEnded?(ok: boolean): void
}

export interface WriteWatcher {
  /**
   * Runs `work` as an edit recorded for `context`, whichever book is open, without telling `recorded`: for Undo's
   * own edits, whose recording is the step that takes them back.
   */
  record<T>(context: RecordingContext, work: (tx: Tx) => Promise<T>): Promise<{ result: T; recording: Recording }>
  /** Puts the database's own methods back. */
  stop(): void
}

const recordings = new WeakMap<object, Recording>()

/** The recording of the edit `tx` belongs to, if it's being recorded. */
export const recordingOf = (tx: Tx): Recording | undefined => recordings.get(tx)

/**
 * Leaves the edit `tx` is writing out of Undo: what the app does by itself, like making a chapter's text when it
 * first opens, and what Undo shouldn't bring back, like Delete forever.
 */
export function skipHistory(tx: Tx) {
  const recording = recordings.get(tx)
  if (recording) recording.skip = true
}

/**
 * Marks the edit `tx` is writing as taking back an earlier one, as leaving out a chapter just added does: if the
 * two cancel out, neither stays in the history.
 */
export function retractEdit(tx: Tx) {
  const recording = recordings.get(tx)
  if (recording) recording.retract = true
}

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i
const WITH_WRITE = /^\s*WITH\b[\s\S]*\b(INSERT|UPDATE|DELETE|REPLACE)\b/i

/** Whether a statement writes, rather than only reading. */
export const isWrite = (sql: string) => WRITE.test(sql) || WITH_WRITE.test(withoutStrings(sql))

type WriteTransaction = (this: Db, callback: (tx: Tx) => Promise<unknown>, ...rest: unknown[]) => Promise<unknown>

/**
 * Wraps `db`'s write methods to record the edits made while a book is open (`hooks.recorded`) and to report every
 * write (`hooks.writeStarted`, `hooks.writeEnded`).
 */
export function watchWrites(db: Db, hooks: RecorderHooks): WriteWatcher {
  const execute = db.execute
  const writeTransaction = db.writeTransaction as WriteTransaction

  const reported = async <T>(work: () => Promise<T>): Promise<T> => {
    hooks.writeStarted?.()
    let ok = false
    try {
      const result = await work()
      ok = true
      return result
    } finally {
      hooks.writeEnded?.(ok)
    }
  }

  /** Runs `work` in a transaction that records into `recording`, making the step before it commits. */
  const recordInto = async <T>(recording: Recording, work: (tx: Tx) => Promise<T>, rest: unknown[] = []) => {
    const result = (await writeTransaction.call(
      db,
      async (tx: Tx) => {
        const result = await work(recordingTx(tx, recording))
        if (!recording.skip && recording.changes.size > 0) {
          try {
            recording.step = (await hooks.finish(tx, recording)) ?? undefined
          } catch (error) {
            // Undo is a convenience: a slip in it mustn't cost the edit.
            console.error("[undo] couldn't record an edit", error)
            recording.skip = true
          }
        }
        return result
      },
      ...rest,
    )) as T
    if (recording.skip) recording.step = undefined
    return result
  }

  const fresh = (context: RecordingContext): Recording => ({ ...context, changes: new Map(), skip: false, retract: false })

  const tell = (recording: Recording) => {
    if (!recording.step) return
    try {
      hooks.recorded(recording)
    } catch (error) {
      console.error("[undo] couldn't keep an edit", error)
    }
  }

  db.writeTransaction = <T>(callback: (tx: Tx) => Promise<T>, ...rest: unknown[]): Promise<T> =>
    reported(async () => {
      const context = hooks.context()
      if (!context) return (await writeTransaction.call(db, callback, ...rest)) as T
      const recording = fresh(context)
      const result = await recordInto(recording, callback, rest)
      tell(recording)
      return result
    })

  db.execute = (sql: string, parameters?: SqlValue[]) => {
    if (!isWrite(sql)) return execute.call(db, sql, parameters)
    return reported(async () => {
      const context = hooks.context()
      if (!context || parseWrite(sql, parameters ?? []).kind === "other") return execute.call(db, sql, parameters)
      // A write on its own still gets a transaction, to read its rows before and after with it.
      const recording = fresh(context)
      const result = await recordInto(recording, (tx) => tx.execute(sql, parameters))
      tell(recording)
      return result
    })
  }

  return {
    record: (context, work) =>
      reported(async () => {
        const recording = fresh(context)
        const result = await recordInto(recording, work)
        return { result, recording }
      }),
    stop() {
      db.execute = execute
      db.writeTransaction = writeTransaction as Db["writeTransaction"]
    },
  }
}

/** A transaction that notes in `recording` what each of its writes does to the tracked tables. */
function recordingTx(tx: Tx, recording: Recording): Tx {
  const lose = (error: unknown) => {
    console.error("[undo] couldn't follow a write, so the edit can't be undone", error)
    recording.skip = true
  }
  const execute = async (sql: string, parameters: SqlValue[] = []) => {
    if (recording.skip) return tx.execute(sql, parameters)
    const write = parseWrite(sql, parameters)
    switch (write.kind) {
      case "other":
        return tx.execute(sql, parameters)
      case "untrackable":
        recording.skip = true
        return tx.execute(sql, parameters)
      case "unreadable":
        lose(new Error(`Unexpected SQL: ${sql}`))
        return tx.execute(sql, parameters)
      case "insert": {
        const result = await tx.execute(sql, parameters)
        try {
          const after = await readRows(tx, write.table, [write.id])
          note(recording, write.table, write.id, null, after.get(write.id) ?? null)
        } catch (error) {
          lose(error)
        }
        return result
      }
      case "update":
      case "delete": {
        let before: Row[]
        try {
          before = await tx.getAll<Row>(`SELECT * FROM ${write.table} WHERE ${write.where}`, write.whereParameters)
        } catch (error) {
          lose(error)
          return tx.execute(sql, parameters)
        }
        const result = await tx.execute(sql, parameters)
        try {
          const ids = before.map((row) => row.id)
          const after = write.kind === "update" && ids.length > 0 ? await readRows(tx, write.table, ids) : null
          for (const row of before) note(recording, write.table, row.id, row, after?.get(row.id) ?? null)
        } catch (error) {
          lose(error)
        }
        return result
      }
    }
  }
  const watched = new Proxy(tx, {
    get(target, key) {
      if (key === "execute") return execute
      const value: unknown = Reflect.get(target, key)
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
  recordings.set(watched, recording)
  return watched
}

async function readRows(tx: Tx, table: string, ids: readonly string[]): Promise<Map<string, Row>> {
  const rows = await tx.getAll<Row>(`SELECT * FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`, [
    JSON.stringify(ids),
  ])
  return new Map(rows.map((row) => [row.id, { ...row }]))
}

/** Notes a row's state after a write. A row met again keeps the state it had before the edit first touched it. */
function note(recording: Recording, table: string, id: string, before: Row | null, after: Row | null) {
  const key = `${table} ${id}`
  const seen = recording.changes.get(key)
  if (seen) seen.after = after
  else recording.changes.set(key, { table, id, before: before && { ...before }, after })
}

// ── Reading the app's SQL ───────────────────────────────────────────────────

export type ParsedWrite =
  /** A read, or a write to a table Undo has no part in. */
  | { kind: "other" }
  | { kind: "untrackable" }
  /** A write to a tracked table in a shape this doesn't know. */
  | { kind: "unreadable" }
  | { kind: "insert"; table: string; id: string }
  | { kind: "update" | "delete"; table: string; where: string; whereParameters: SqlValue[] }

const TABLE_OF: Record<string, RegExp> = {
  INSERT: /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i,
  REPLACE: /^\s*REPLACE\s+INTO\s+(\w+)/i,
  UPDATE: /^\s*UPDATE\s+(?:OR\s+\w+\s+)?(\w+)/i,
  DELETE: /^\s*DELETE\s+FROM\s+(\w+)/i,
}

const INSERT = /^\s*INSERT\s+INTO\s+\w+\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)\s*;?\s*$/i
const UPDATE = /^\s*UPDATE\s+\w+\s+SET\s+([\s\S]*?)\s*;?\s*$/i
const DELETE = /^\s*DELETE\s+FROM\s+\w+\s+([\s\S]*?)\s*;?\s*$/i

/** What a statement writes, as far as Undo needs to know. */
export function parseWrite(sql: string, parameters: readonly SqlValue[]): ParsedWrite {
  const verb = WRITE.exec(sql)?.[1]?.toUpperCase()
  if (!verb) return WITH_WRITE.test(withoutStrings(sql)) ? { kind: "unreadable" } : { kind: "other" }
  const table = TABLE_OF[verb].exec(sql)?.[1]?.toLowerCase()
  if (!table) return { kind: "unreadable" }
  if (UNTRACKABLE.has(table)) return { kind: "untrackable" }
  if (!(table in TRACKED)) return { kind: "other" }
  // Only plain ? placeholders, counted below.
  if (/\?\d|[:@$][a-z_]/i.test(withoutStrings(sql))) return { kind: "unreadable" }

  if (verb === "INSERT") {
    const match = INSERT.exec(sql)
    const columns = match?.[1].split(",").map((column) => column.trim().toLowerCase())
    const values = match ? splitTopLevel(match[2]) : null
    if (!columns || !values || values.length !== columns.length) return { kind: "unreadable" }
    const at = columns.indexOf("id")
    if (at === -1 || values[at].trim() !== "?") return { kind: "unreadable" }
    const id = parameters[countPlaceholders(values.slice(0, at).join(","))]
    return typeof id === "string" ? { kind: "insert", table, id } : { kind: "unreadable" }
  }

  if (verb === "UPDATE") {
    const rest = UPDATE.exec(sql)?.[1]
    const at = rest === undefined ? -1 : topLevelWhere(rest)
    if (rest === undefined || at === -1) return { kind: "unreadable" }
    return {
      kind: "update",
      table,
      where: rest.slice(at + "WHERE".length).trim(),
      whereParameters: parameters.slice(countPlaceholders(rest.slice(0, at))),
    }
  }

  if (verb === "DELETE") {
    const rest = DELETE.exec(sql)?.[1]
    if (rest === undefined || topLevelWhere(rest) !== 0) return { kind: "unreadable" }
    return { kind: "delete", table, where: rest.slice("WHERE".length).trim(), whereParameters: [...parameters] }
  }

  return { kind: "unreadable" }
}

/** The SQL with its quoted strings and names blanked out, so nothing in them passes for syntax. */
function withoutStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, (quoted) => " ".repeat(quoted.length))
}

const countPlaceholders = (sql: string) => (withoutStrings(sql).match(/\?/g) ?? []).length

/** Splits a list at its top-level commas; null if its brackets don't balance. */
function splitTopLevel(list: string): string[] | null {
  const text = withoutStrings(list)
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "(") depth++
    else if (char === ")" && --depth < 0) return null
    else if (char === "," && depth === 0) {
      parts.push(list.slice(start, i))
      start = i + 1
    }
  }
  if (depth !== 0) return null
  parts.push(list.slice(start))
  return parts
}

/** Where the statement's own WHERE starts, outside brackets and strings; -1 if it has none. */
function topLevelWhere(sql: string): number {
  const text = withoutStrings(sql)
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "(") depth++
    else if (char === ")") depth--
    else if (
      depth === 0 &&
      /^where[\s(]/i.test(text.slice(i, i + 6)) &&
      (i === 0 || /[\s)]/.test(text[i - 1]))
    ) {
      return i
    }
  }
  return -1
}
