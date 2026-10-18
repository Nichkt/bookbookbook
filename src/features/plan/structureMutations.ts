import { ChangeSet } from "@/db/changes"
import { insertRow, updateRow, type Db, type Tx } from "@/db/tx"
import { newId } from "@/lib/id"
import { BUILTIN_STRUCTURES, customKey, normalizeStructure, structureColumn, type StructureDraft } from "./structures"

/*
 * The writer's own story structures (DESIGN.md §6 "Templates"): `templates` rows of kind "overlay", shared by all
 * their books. The built-in ones live in code and can't be changed, only copied.
 */

const KIND = "overlay"

/** Cleans up a draft and puts its acts and moments in the order they come in the book. */
function prepare(draft: StructureDraft): StructureDraft {
  const clean = normalizeStructure(draft)
  if (!clean) throw new Error("A structure needs at least one moment with a name.")
  const byPct = <T extends { pct: number }>(items: T[]) => [...items].sort((a, b) => a.pct - b.pct)
  return { name: clean.name, acts: byPct(clean.acts), beats: byPct(clean.beats) }
}

/** `wanted`, or "wanted 2", "wanted 3"… when a built-in or another of the writer's structures has that name. */
async function freeName(tx: Tx, wanted: string, exceptId: string | null): Promise<string> {
  const rows = await tx.getAll<{ id: string; name: string | null }>(
    "SELECT id, name FROM templates WHERE kind = ?",
    [KIND],
  )
  const fold = (name: string) => name.trim().toLocaleLowerCase()
  const taken = new Set([
    ...BUILTIN_STRUCTURES.map((structure) => fold(structure.name)),
    ...rows.filter((row) => row.id !== exceptId).map((row) => fold(row.name ?? "")),
  ])
  let name = wanted
  for (let n = 2; taken.has(fold(name)); n++) name = `${wanted} ${n}`
  return name
}

/** Saves a new structure. Returns its id, its key for `books.template_key`, and the name it got. */
export async function createStructure(db: Db, draft: StructureDraft) {
  const clean = prepare(draft)
  return db.writeTransaction(async (tx) => {
    const id = newId()
    const name = await freeName(tx, clean.name, null)
    await insertRow(tx, "templates", { id, owner_id: null, name, kind: KIND, beats: structureColumn(clean) })
    return { id, key: customKey(id), name }
  })
}

/**
 * Saves changes to a structure. Chapters marked as a moment it no longer has keep their mark, which then reads as
 * the moment's old name. Returns the name it got.
 */
export async function updateStructure(db: Db, id: string, draft: StructureDraft): Promise<string> {
  const clean = prepare(draft)
  return db.writeTransaction(async (tx) => {
    const name = await freeName(tx, clean.name, id)
    await updateRow(tx, "templates", id, { name, beats: structureColumn(clean) })
    return name
  })
}

/** Deletes a structure. Books that follow it then follow none. Returns what Undo needs. */
export async function deleteStructure(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "templates", [id])
    await changes.capture(tx, "books", "template_key = ?", [customKey(id)])
    await tx.execute("UPDATE books SET template_key = NULL WHERE template_key = ?", [customKey(id)])
    await tx.execute("DELETE FROM templates WHERE id = ?", [id])
    return changes
  })
}
