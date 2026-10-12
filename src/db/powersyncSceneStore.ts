import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { base64ToBytes, bytesToBase64 } from "@/yjs/base64"
import type { SceneStore, StoredRow } from "@/yjs/sceneStore"
import { tablesBehind } from "./schema"

// Version-history snapshots (auto/manual) are left alone: only compaction snapshots are part of the live doc.
const ROW_IDS = `
  SELECT id, 'update' AS kind FROM scene_updates WHERE scene_id = ?1
  UNION ALL
  SELECT id, 'snapshot' AS kind FROM snapshots WHERE scene_id = ?1 AND kind = 'compaction'`

const ROW_DATA = `
  SELECT id, 'update' AS kind, update_b64 AS b64 FROM scene_updates WHERE id IN (SELECT value FROM json_each(?1))
  UNION ALL
  SELECT id, 'snapshot' AS kind, state_b64 AS b64 FROM snapshots
    WHERE kind = 'compaction' AND id IN (SELECT value FROM json_each(?1))`

/** Scene prose rows in SQLite: `scene_updates` plus compaction rows in `snapshots` (DESIGN.md §5, §11.5). */
export function createPowerSyncSceneStore(db: AbstractPowerSyncDatabase): SceneStore {
  return {
    async read(sceneId, seen) {
      // Ids first, then data only for unseen rows: after our own write, there's usually nothing to fetch.
      const ids = await db.getAll<{ id: string; kind: StoredRow["kind"] }>(ROW_IDS, [sceneId])
      const wanted = ids.filter((row) => !seen.has(row.id)).map((row) => row.id)
      const rows = wanted.length
        ? await db.getAll<{ id: string; kind: StoredRow["kind"]; b64: string | null }>(ROW_DATA, [JSON.stringify(wanted)])
        : []
      return {
        unseen: rows.filter((row) => row.b64).map((row) => ({ id: row.id, kind: row.kind, data: base64ToBytes(row.b64!) })),
        present: new Set(ids.map((row) => row.id)),
      }
    },

    onChange(_sceneId, listener) {
      // Notifications name tables, not rows: every open scene re-reads its ids when any scene changes.
      return db.onChange({ onChange: listener }, { tables: tablesBehind("scene_updates", "snapshots"), throttleMs: 30 })
    },

    async appendUpdate(sceneId, id, update) {
      await db.execute("INSERT INTO scene_updates (id, scene_id, update_b64, created_at) VALUES (?, ?, ?, ?)", [
        id,
        sceneId,
        bytesToBase64(update),
        new Date().toISOString(),
      ])
    },

    async compact(sceneId, snapshot, replaces) {
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          "INSERT INTO snapshots (id, scene_id, state_b64, kind, created_at) VALUES (?, ?, ?, 'compaction', ?)",
          [snapshot.id, sceneId, bytesToBase64(snapshot.state), new Date().toISOString()],
        )
        const ids = JSON.stringify(replaces)
        await tx.execute("DELETE FROM scene_updates WHERE id IN (SELECT value FROM json_each(?))", [ids])
        await tx.execute(
          "DELETE FROM snapshots WHERE kind = 'compaction' AND id IN (SELECT value FROM json_each(?))",
          [ids],
        )
      })
    },
  }
}
