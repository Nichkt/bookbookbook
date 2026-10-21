import * as Y from "yjs"
import { newId } from "@/lib/id"
import type { SceneStore, StoredRow } from "./sceneStore"

/** Origin for changes applied from storage, so they aren't written back. */
const FROM_STORE = Symbol("scene-store")

export interface SceneDocProviderOptions {
  /** Compact once this many update rows are folded into the doc (DESIGN.md §11: ~500). */
  compactAfter?: number
  /** After this long without local edits, compact if at least `idleMinUpdates` rows have built up. */
  idleCompactMs?: number
  idleMinUpdates?: number
  newId?: () => string
  onError?: (error: unknown) => void
  /** Called after each local edit, e.g. to request persistent storage once. */
  onLocalUpdate?: () => void
  /**
   * Called when the doc comes to hold edits no stored row has, because a write failed (true), and once a compaction
   * has stored them after all (false).
   */
  onUnsavedChange?: (unsaved: boolean) => void
}

/**
 * Keeps one scene's Y.Doc in step with its stored rows (the pattern from PowerSync's Yjs demo).
 * Local edits are appended as update rows. Rows written elsewhere (another tab now, other devices once sync
 * lands) are applied as they appear. Compaction folds many rows into one snapshot.
 */
export class SceneDocProvider {
  readonly doc = new Y.Doc()
  readonly sceneId: string
  /** Resolves once everything stored for the scene when it opened is in the doc. */
  readonly loaded: Promise<void>

  private readonly store: SceneStore
  private readonly options: Required<Omit<SceneDocProviderOptions, "onLocalUpdate" | "onUnsavedChange">> &
    Pick<SceneDocProviderOptions, "onLocalUpdate" | "onUnsavedChange">
  /** Row ids already in the doc: applied from storage or written by this provider. */
  private readonly seen = new Set<string>()
  /** Stored rows whose content is in the doc, so a compaction snapshot may replace them. */
  private readonly covered = new Set<string>()
  private coveredUpdates = 0
  private readonly snapshotIds = new Set<string>()
  /** Local updates waiting to be written; merged into one row if they pile up behind a slow write. */
  private queue: Uint8Array[] = []
  private writing: Promise<void> | null = null
  /** A write failed, so the doc holds edits no row has. The next compaction stores them. */
  private unsaved = false
  /** `unsaved` as onUnsavedChange last reported it. */
  private reportedUnsaved = false
  private pulling: Promise<void> | null = null
  private pullAgain = false
  private compacting: Promise<void> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private readonly unsubscribe: () => void

  constructor(store: SceneStore, sceneId: string, options: SceneDocProviderOptions = {}) {
    this.store = store
    this.sceneId = sceneId
    this.options = {
      compactAfter: 500,
      idleCompactMs: 30_000,
      idleMinUpdates: 50,
      newId,
      onError: (error) => console.error("[scene-doc]", error),
      ...options,
    }
    this.doc.on("updateV2", this.handleUpdate)
    this.unsubscribe = store.onChange(sceneId, () => void this.pull())
    this.loaded = this.pull()
  }

  /** Stored update rows a compaction would fold away. */
  get pendingRows(): number {
    return this.coveredUpdates
  }

  /** Whether the doc holds edits that failed to save, which the next compaction stores. */
  get hasUnsaved(): boolean {
    return this.unsaved
  }

  /** Applies stored rows the doc hasn't seen. One read at a time; a change during a read triggers one more. */
  pull(): Promise<void> {
    if (this.pulling) {
      this.pullAgain = true
      return this.pulling
    }
    this.pulling = (async () => {
      try {
        do {
          this.pullAgain = false
          // Rows covered before the read began are committed, so if the read misses one, another tab's
          // compaction removed it. Rows that finish writing during the read may be missing for that reason alone.
          const coveredBefore = new Set(this.covered)
          const { unseen, present } = await this.store.read(this.sceneId, this.seen)
          if (this.closed) return
          for (const id of coveredBefore) if (!present.has(id)) this.uncover(id)
          this.apply(unseen)
        } while (this.pullAgain && !this.closed)
      } catch (error) {
        this.options.onError(error)
      } finally {
        this.pulling = null
      }
    })()
    return this.pulling
  }

  /** Resolves once every local edit made so far has been written (or has failed and been flagged). */
  async flush(): Promise<void> {
    while (this.writing) await this.writing
  }

  /**
   * Replaces every covered row with one snapshot of the whole doc. Safe while other tabs (or devices) compact
   * the same scene: each snapshot contains every row it deletes, and rows this doc hasn't seen are left alone.
   */
  compact(): Promise<void> {
    this.compacting ??= this.runCompaction().finally(() => {
      this.compacting = null
    })
    return this.compacting
  }

  /** Writes pending edits, compacts if worthwhile, then releases the doc. */
  async destroy(): Promise<void> {
    if (this.closed) return
    clearTimeout(this.idleTimer)
    this.unsubscribe()
    await this.flush()
    if (this.worthCompacting(this.options.idleMinUpdates)) await this.compact()
    await this.compacting
    this.closed = true
    this.doc.off("updateV2", this.handleUpdate)
    this.doc.destroy()
  }

  private apply(rows: StoredRow[]) {
    const fresh = rows.filter((row) => !this.seen.has(row.id))
    if (fresh.length === 0) return
    // Snapshots first: they carry most of the state, so the updates after them integrate directly.
    fresh.sort((a, b) => Number(a.kind === "update") - Number(b.kind === "update"))
    Y.transact(
      this.doc,
      () => {
        for (const row of fresh) {
          this.seen.add(row.id)
          try {
            Y.applyUpdateV2(this.doc, row.data, FROM_STORE)
          } catch (error) {
            // Unreadable row: never retried and never covered, so compaction can't delete the evidence.
            this.options.onError(new Error(`Scene ${this.sceneId}: skipped unreadable row ${row.id}`, { cause: error }))
            continue
          }
          this.cover(row.id, row.kind)
        }
      },
      FROM_STORE,
    )
    this.compactIfDue()
  }

  private handleUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === FROM_STORE || this.closed) return
    this.queue.push(update)
    this.startWriting()
    this.options.onLocalUpdate?.()
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (this.worthCompacting(this.options.idleMinUpdates)) void this.compact()
    }, this.options.idleCompactMs)
  }

  private startWriting() {
    if (this.writing || this.queue.length === 0) return
    this.writing = this.drainQueue().finally(() => {
      this.writing = null
      // An edit may have been queued after the loop's last check.
      if (this.queue.length > 0) this.startWriting()
      else this.compactIfDue()
    })
  }

  private async drainQueue() {
    while (this.queue.length > 0) {
      const batch = this.queue
      this.queue = []
      const update = batch.length === 1 ? batch[0] : Y.mergeUpdatesV2(batch)
      const id = this.options.newId()
      // Mark it seen before it lands, so the change notification for our own write doesn't apply it again.
      this.seen.add(id)
      try {
        await this.store.appendUpdate(this.sceneId, id, update)
        if (!this.closed) this.cover(id, "update")
      } catch (error) {
        this.unsaved = true
        this.reportUnsaved()
        this.options.onError(error)
      }
    }
  }

  private reportUnsaved() {
    if (this.unsaved === this.reportedUnsaved) return
    this.reportedUnsaved = this.unsaved
    this.options.onUnsavedChange?.(this.unsaved)
  }

  private cover(id: string, kind: StoredRow["kind"]) {
    if (this.covered.has(id)) return
    this.covered.add(id)
    if (kind === "snapshot") this.snapshotIds.add(id)
    else this.coveredUpdates++
  }

  private uncover(id: string) {
    if (!this.covered.delete(id)) return
    if (!this.snapshotIds.delete(id)) this.coveredUpdates--
  }

  private worthCompacting(minUpdates: number) {
    return this.unsaved || this.coveredUpdates >= minUpdates || this.snapshotIds.size > 1
  }

  private compactIfDue() {
    if (this.unsaved || this.coveredUpdates >= this.options.compactAfter) void this.compact()
  }

  private async runCompaction() {
    // Let queued local edits land first so their rows can be replaced too.
    await this.flush()
    if (this.closed) return
    // Capture the rows and the state together: the snapshot then contains every row it replaces.
    const replaces = [...this.covered]
    const hadUnsaved = this.unsaved
    if (!hadUnsaved && this.coveredUpdates === 0 && this.snapshotIds.size <= 1) return
    const snapshot = { id: this.options.newId(), state: Y.encodeStateAsUpdateV2(this.doc) }
    this.seen.add(snapshot.id)
    this.unsaved = false
    try {
      await this.store.compact(this.sceneId, snapshot, replaces)
    } catch (error) {
      if (hadUnsaved) this.unsaved = true
      this.options.onError(error)
      return
    }
    for (const id of replaces) this.uncover(id)
    this.cover(snapshot.id, "snapshot")
    this.reportUnsaved()
  }
}
