import type { SceneStore, StoreRead, StoredRow } from "./sceneStore"

interface Row extends StoredRow {
  sceneId: string
}

/**
 * A SceneStore held in memory. Several providers sharing one store behave like tabs sharing one database:
 * writes are asynchronous, and change notifications arrive on a later task, as they do from PowerSync.
 */
export class MemorySceneStore implements SceneStore {
  readonly rows = new Map<string, Row>()
  /** Makes the next N appendUpdate calls fail, to test recovery. */
  failNextAppends = 0
  private readonly listeners = new Set<{ sceneId: string; listener: () => void }>()
  /** Calls and change notifications still in flight. */
  private busy = 0

  read(sceneId: string, seen: ReadonlySet<string>): Promise<StoreRead> {
    return this.later(() => {
      const rows = [...this.rows.values()].filter((row) => row.sceneId === sceneId)
      return {
        unseen: rows.filter((row) => !seen.has(row.id)).map(({ id, kind, data }) => ({ id, kind, data })),
        present: new Set(rows.map((row) => row.id)),
      }
    })
  }

  onChange(sceneId: string, listener: () => void): () => void {
    const entry = { sceneId, listener }
    this.listeners.add(entry)
    return () => this.listeners.delete(entry)
  }

  appendUpdate(sceneId: string, id: string, data: Uint8Array): Promise<void> {
    return this.later(() => {
      if (this.failNextAppends > 0) {
        this.failNextAppends--
        throw new Error("Simulated write failure")
      }
      this.rows.set(id, { id, sceneId, kind: "update", data })
      this.notify(sceneId)
    })
  }

  compact(sceneId: string, snapshot: { id: string; state: Uint8Array }, replaces: string[]): Promise<void> {
    return this.later(() => {
      this.rows.set(snapshot.id, { id: snapshot.id, sceneId, kind: "snapshot", data: snapshot.state })
      for (const id of replaces) this.rows.delete(id)
      this.notify(sceneId)
    })
  }

  /** Stores a row as if another device had synced it in. */
  inject(sceneId: string, row: StoredRow) {
    this.rows.set(row.id, { ...row, sceneId })
    this.notify(sceneId)
  }

  count(sceneId: string, kind?: StoredRow["kind"]) {
    return [...this.rows.values()].filter((row) => row.sceneId === sceneId && (!kind || row.kind === kind)).length
  }

  /**
   * Resolves once nothing is in flight: no calls, no pending notifications, and nothing new started by them.
   * Every provider step either calls the store or runs as a promise continuation, so this means all are idle.
   */
  async settled(): Promise<void> {
    // A continuation can start a new call just after a task ends, so wait for two quiet tasks in a row.
    for (let quiet = 0; quiet < 2; ) {
      await nextTask()
      quiet = this.busy === 0 ? quiet + 1 : 0
    }
  }

  private async later<T>(operation: () => T): Promise<T> {
    this.busy++
    try {
      await nextTask()
      return operation()
    } finally {
      this.busy--
    }
  }

  private notify(sceneId: string) {
    this.busy++
    schedule(() => {
      this.busy--
      for (const { sceneId: id, listener } of this.listeners) if (id === sceneId) listener()
    })
  }
}

// setImmediate where there is one (Node): setTimeout is clamped to ~15 ms on Windows, which makes tests crawl.
const setImmediateFn = (globalThis as { setImmediate?: (callback: () => void) => unknown }).setImmediate
const schedule = (callback: () => void) => {
  if (setImmediateFn) setImmediateFn(callback)
  else setTimeout(callback)
}
const nextTask = () => new Promise<void>((resolve) => schedule(resolve))
