import { ChangeSet } from "@/db/changes"
import { insertCodexType, type CodexTypeKey } from "@/db/codexTypes"
import { insertRow, updateRow, type Db, type SqlValue, type Tx } from "@/db/tx"
import { newId } from "@/lib/id"
import { uniqueStrings } from "@/lib/json"
import { plainToRichText } from "@/lib/richText"
import { parseFields, parseFieldSchema, type AiContext } from "./codexData"

/*
 * Codex edits (DESIGN.md §7). Each runs in one transaction. Fields are read and written inside it, so two fields
 * saved at once don't overwrite each other.
 */

/** An empty rich-text doc, the format codex notes use. */
export const EMPTY_NOTES = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** The icon a type of the writer's own gets (built-in types have their own, see CODEX_TYPES). */
export const CUSTOM_TYPE_ICON = "shapes"

const timestamp = () => new Date().toISOString()

async function universeOf(tx: Tx, bookId: string) {
  const { universe_id: universeId } = await tx.get<{ universe_id: string }>(
    "SELECT universe_id FROM books WHERE id = ?",
    [bookId],
  )
  return universeId
}

interface NewEntry {
  typeId: string | null
  name: string
  color: string
  fields?: Record<string, string>
  aliases?: readonly string[]
  /** Plain text, a paragraph per line. */
  notes?: string
}

async function insertEntry(tx: Tx, values: NewEntry & { universeId: string }) {
  const id = newId()
  await insertRow(tx, "codex_entries", {
    id,
    universe_id: values.universeId,
    type_id: values.typeId,
    name: values.name.trim(),
    aliases: JSON.stringify(uniqueStrings(values.aliases ?? [])),
    fields: JSON.stringify(values.fields ?? {}),
    notes: values.notes?.trim() ? plainToRichText(values.notes.trim()) : EMPTY_NOTES,
    tags: "[]",
    ai_context: "mentioned",
    color: values.color,
    image_path: null,
    deleted_at: null,
  })
  return id
}

/**
 * Quick-create from a picker (DESIGN.md §6): a bare entry of `typeKey` in the book's universe, named and colored,
 * to fill in later in the Codex. Creates the built-in type if the universe lacks it. Returns the entry id.
 */
export async function createCodexEntry(
  db: Db,
  input: { bookId: string; typeKey: CodexTypeKey; name: string; color: string },
): Promise<string> {
  return db.writeTransaction((tx) => insertCodexEntry(tx, input))
}

/**
 * `createCodexEntry` inside a transaction, with field values (label → text) if wanted. Notes what it creates in
 * `changes`, when given, so Undo removes it.
 */
export async function insertCodexEntry(
  tx: Tx,
  input: { bookId: string; typeKey: CodexTypeKey; name: string; color: string; fields?: Record<string, string> },
  changes?: ChangeSet,
): Promise<string> {
  const universeId = await universeOf(tx, input.bookId)
  const type = await tx.getOptional<{ id: string }>(
    "SELECT id FROM codex_types WHERE universe_id = ? AND key = ? ORDER BY id LIMIT 1",
    [universeId, input.typeKey],
  )
  let typeId = type?.id
  if (!typeId) {
    typeId = await insertCodexType(tx, universeId, input.typeKey)
    changes?.created(tx, "codex_types", typeId)
  }
  const id = await insertEntry(tx, { universeId, typeId, name: input.name, color: input.color, fields: input.fields })
  changes?.created(tx, "codex_entries", id)
  return id
}

/** A new entry of a type the Codex lists, built-in or the writer's own, with aliases and notes if given. Returns its id. */
export async function createEntry(db: Db, input: NewEntry & { bookId: string }): Promise<string> {
  return db.writeTransaction(async (tx) =>
    insertEntry(tx, { universeId: await universeOf(tx, input.bookId), ...input }),
  )
}

export interface EntryPatch {
  name?: string
  typeId?: string | null
  aliases?: readonly string[]
  tags?: readonly string[]
  /** Plain text, a paragraph per line. */
  notes?: string
  aiContext?: AiContext
  color?: string
}

export async function updateEntry(db: Db, id: string, patch: EntryPatch) {
  const values: Record<string, SqlValue> = {}
  if (patch.name !== undefined) values.name = patch.name.trim()
  if (patch.typeId !== undefined) values.type_id = patch.typeId
  if (patch.aliases !== undefined) values.aliases = JSON.stringify(uniqueStrings(patch.aliases))
  if (patch.tags !== undefined) values.tags = JSON.stringify(uniqueStrings(patch.tags))
  if (patch.notes !== undefined) values.notes = plainToRichText(patch.notes)
  if (patch.aiContext !== undefined) values.ai_context = patch.aiContext
  if (patch.color !== undefined) values.color = patch.color
  await updateRow(db, "codex_entries", id, values)
}

async function editFields(db: Db, id: string, edit: (fields: Record<string, string>) => void) {
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ fields: string | null }>("SELECT fields FROM codex_entries WHERE id = ?", [id])
    if (!row) return
    const fields = parseFields(row.fields)
    edit(fields)
    await updateRow(tx, "codex_entries", id, { fields: JSON.stringify(fields) })
  })
}

/**
 * Sets one field's value, adding the field to the entry if it lacks it. A key that differs only in case, which the
 * page shows as this field, is replaced by it.
 */
export async function setEntryField(db: Db, id: string, label: string, value: string) {
  const lower = label.toLowerCase()
  await editFields(db, id, (fields) => {
    for (const key of Object.keys(fields)) if (key !== label && key.toLowerCase() === lower) delete fields[key]
    fields[label] = value
  })
}

/** Takes a field off the entry, with its value. A field of the entry's type stays, empty. */
export async function removeEntryField(db: Db, id: string, label: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    const row = await tx.getOptional<{ fields: string | null }>("SELECT fields FROM codex_entries WHERE id = ?", [id])
    if (!row) return changes
    const fields = parseFields(row.fields)
    if (!Object.hasOwn(fields, label)) return changes
    await changes.captureIds(tx, "codex_entries", [id])
    delete fields[label]
    await updateRow(tx, "codex_entries", id, { fields: JSON.stringify(fields) })
    return changes
  })
}

const typeSchema = (labels: readonly string[]) => JSON.stringify(labels.map((label) => ({ label, kind: "text" })))

/** Adds a field to every entry of the type. False if the type has it already. */
export async function addTypeField(db: Db, typeId: string, label: string): Promise<boolean> {
  const name = label.trim()
  if (!name) return false
  return db.writeTransaction(async (tx) => {
    const type = await tx.getOptional<{ field_schema: string | null }>(
      "SELECT field_schema FROM codex_types WHERE id = ?",
      [typeId],
    )
    if (!type) return false
    const labels = parseFieldSchema(type.field_schema)
    if (labels.some((existing) => existing.toLowerCase() === name.toLowerCase())) return false
    await updateRow(tx, "codex_types", typeId, { field_schema: typeSchema([...labels, name]) })
    return true
  })
}

export interface RemovedTypeField {
  changes: ChangeSet
  /** Entries outside the Trash that filled the field in, and so keep it as a field of their own. */
  kept: number
}

/**
 * Takes a field off the type, ignoring case. Entries that filled it in keep their text, as a field of their own;
 * on the rest it goes, and on `from` (the entry it was removed on) it goes regardless.
 */
export async function removeTypeField(
  db: Db,
  typeId: string,
  label: string,
  from: string | null = null,
): Promise<RemovedTypeField> {
  const lower = label.trim().toLowerCase()
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    let kept = 0
    const type = await tx.getOptional<{ field_schema: string | null }>(
      "SELECT field_schema FROM codex_types WHERE id = ?",
      [typeId],
    )
    const labels = parseFieldSchema(type?.field_schema ?? null)
    if (!labels.some((existing) => existing.toLowerCase() === lower)) return { changes, kept }
    await changes.captureIds(tx, "codex_types", [typeId])
    await updateRow(tx, "codex_types", typeId, {
      field_schema: typeSchema(labels.filter((existing) => existing.toLowerCase() !== lower)),
    })
    const entries = await tx.getAll<{ id: string; fields: string | null; deleted_at: string | null }>(
      "SELECT id, fields, deleted_at FROM codex_entries WHERE type_id = ?",
      [typeId],
    )
    for (const entry of entries) {
      const fields = parseFields(entry.fields)
      const matching = Object.keys(fields).filter((key) => key.toLowerCase() === lower)
      const doomed = entry.id === from ? matching : matching.filter((key) => !fields[key]?.trim())
      if (matching.length > doomed.length && entry.deleted_at === null) kept++
      if (doomed.length === 0) continue
      await changes.captureIds(tx, "codex_entries", [entry.id])
      for (const key of doomed) delete fields[key]
      await updateRow(tx, "codex_entries", entry.id, { fields: JSON.stringify(fields) })
    }
    return { changes, kept }
  })
}

// ── Types ───────────────────────────────────────────────────────────────────

/** A type of the writer's own, with no fields yet: entries add theirs. Returns its id. */
export async function createCustomType(db: Db, input: { bookId: string; name: string }): Promise<string> {
  return db.writeTransaction(async (tx) => {
    const id = newId()
    await insertRow(tx, "codex_types", {
      id,
      universe_id: await universeOf(tx, input.bookId),
      key: null,
      name: input.name.trim(),
      icon: CUSTOM_TYPE_ICON,
      field_schema: "[]",
      builtin: 0,
    })
    return id
  })
}

export async function renameType(db: Db, id: string, name: string) {
  await updateRow(db, "codex_types", id, { name: name.trim() })
}

/**
 * Deletes a type of the writer's own. The UI only offers it once the type has no entries outside the Trash; any
 * left in the Trash lose their type and come back without one.
 */
export async function deleteType(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "codex_types", [id])
    await changes.capture(tx, "codex_entries", "type_id = ?", [id])
    await tx.execute("UPDATE codex_entries SET type_id = NULL WHERE type_id = ?", [id])
    await tx.execute("DELETE FROM codex_types WHERE id = ?", [id])
    return changes
  })
}

// ── Trash ───────────────────────────────────────────────────────────────────

/** Moves an entry to the Trash. Links to it from the plan stay, hidden, and come back if it's restored. */
export async function trashEntry(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "codex_entries", [id])
    await updateRow(tx, "codex_entries", id, { deleted_at: timestamp() })
    return changes
  })
}

export async function restoreEntry(db: Db, id: string) {
  await updateRow(db, "codex_entries", id, { deleted_at: null })
}
