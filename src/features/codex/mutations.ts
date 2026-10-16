import { insertCodexType, type CodexTypeKey } from "@/db/codexTypes"
import { insertRow, type Db } from "@/db/tx"
import { newId } from "@/lib/id"

/** An empty rich-text doc, the format codex notes use. */
export const EMPTY_NOTES = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/**
 * Quick-create from a picker (DESIGN.md §6): a bare entry of `typeKey` in the book's universe, named and colored,
 * to fill in later in the Codex. Creates the built-in type if the universe lacks it. Returns the entry id.
 */
export async function createCodexEntry(
  db: Db,
  input: { bookId: string; typeKey: CodexTypeKey; name: string; color: string },
): Promise<string> {
  return db.writeTransaction(async (tx) => {
    const { universe_id: universeId } = await tx.get<{ universe_id: string }>(
      "SELECT universe_id FROM books WHERE id = ?",
      [input.bookId],
    )
    const type = await tx.getOptional<{ id: string }>(
      "SELECT id FROM codex_types WHERE universe_id = ? AND key = ? ORDER BY id LIMIT 1",
      [universeId, input.typeKey],
    )
    const typeId = type?.id ?? (await insertCodexType(tx, universeId, input.typeKey))
    const id = newId()
    await insertRow(tx, "codex_entries", {
      id,
      universe_id: universeId,
      type_id: typeId,
      name: input.name.trim(),
      aliases: "[]",
      fields: "{}",
      notes: EMPTY_NOTES,
      tags: "[]",
      ai_context: "mentioned",
      color: input.color,
      image_path: null,
    })
    return id
  })
}
