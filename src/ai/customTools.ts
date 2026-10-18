import { ChangeSet } from "@/db/changes"
import { insertRow, updateRow, type Db } from "@/db/tx"
import { newId } from "@/lib/id"
import type { OutputMode } from "./tools"

/*
 * The writer's own tools (DESIGN.md §9 "Custom tools"): a prompt with placeholders, shared by all their books. Kept on
 * this device until accounts (M9) sync them.
 */

export interface CustomToolDraft {
  name: string
  template: string
  mode: OutputMode
}

export async function createCustomTool(db: Db, draft: CustomToolDraft): Promise<string> {
  const id = newId()
  await insertRow(db, "custom_tools", {
    id,
    owner_id: null,
    name: draft.name.trim(),
    prompt_template: draft.template,
    output_mode: draft.mode,
    default_model: null,
  })
  return id
}

export async function updateCustomTool(db: Db, id: string, draft: CustomToolDraft) {
  await updateRow(db, "custom_tools", id, {
    name: draft.name.trim(),
    prompt_template: draft.template,
    output_mode: draft.mode,
  })
}

/** Returns what Undo needs. */
export async function deleteCustomTool(db: Db, id: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.captureIds(tx, "custom_tools", [id])
    await tx.execute("DELETE FROM custom_tools WHERE id = ?", [id])
    return changes
  })
}
