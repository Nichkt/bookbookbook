/** One stored piece of a scene's Y.Doc: an incremental update, or a compaction snapshot that replaced many. */
export interface StoredRow {
  id: string
  kind: "update" | "snapshot"
  data: Uint8Array
}

export interface StoreRead {
  /** Rows not in the `seen` set passed to `read`. */
  unseen: StoredRow[]
  /** Ids of every row stored for the scene right now, seen or not. */
  present: ReadonlySet<string>
}

/**
 * Where a scene's Yjs rows live. The app uses SQLite through PowerSync (src/db/powersyncSceneStore.ts);
 * tests use src/yjs/memorySceneStore.ts. Rows are only ever appended, except that compaction replaces many rows
 * with one snapshot. Applying a row twice is harmless: Yjs updates are idempotent and commutative.
 */
export interface SceneStore {
  read(sceneId: string, seen: ReadonlySet<string>): Promise<StoreRead>
  /** Calls `listener` whenever the scene's rows may have changed, from this tab or another. Returns an unsubscribe. */
  onChange(sceneId: string, listener: () => void): () => void
  appendUpdate(sceneId: string, id: string, update: Uint8Array): Promise<void>
  /** In one transaction: store `snapshot`, then delete exactly the listed rows, which it must contain. */
  compact(sceneId: string, snapshot: { id: string; state: Uint8Array }, replaces: string[]): Promise<void>
}
