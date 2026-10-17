import * as Y from "yjs"
import type { Db } from "@/db/tx"
import { base64ToBytes } from "@/yjs/base64"
import { contentState } from "@/yjs/versions"

/** Reads a scene's prose, as the state of a fresh doc (`contentState`). */
export type SceneReader = (sceneId: string) => Promise<Uint8Array>

/**
 * Reads prose as stored: the scene's compaction snapshots and the updates written since (DESIGN.md §5). Open
 * editors write each edit as it happens; flush them first to include the last keystroke. A row that can't be read
 * is skipped, as the editor skips it, so one bad row can't stop the book from being exported or backed up.
 */
export function storedSceneReader(db: Db): SceneReader {
  return async (sceneId) => {
    const rows = await db.getAll<{ id: string; b64: string | null }>(
      `SELECT id, state_b64 AS b64 FROM snapshots WHERE scene_id = ? AND kind = 'compaction'
       UNION ALL
       SELECT id, update_b64 AS b64 FROM scene_updates WHERE scene_id = ?`,
      [sceneId, sceneId],
    )
    const doc = new Y.Doc()
    try {
      // Yjs applies updates in any order, holding back what it can't place yet.
      for (const row of rows) {
        if (!row.b64) continue
        try {
          Y.applyUpdateV2(doc, base64ToBytes(row.b64))
        } catch (error) {
          console.error(`[export] Scene ${sceneId}: skipped unreadable row ${row.id}`, error)
        }
      }
      return contentState(doc)
    } finally {
      doc.destroy()
    }
  }
}
