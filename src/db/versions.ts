import type * as Y from "yjs"
import { newId } from "@/lib/id"
import { countWords } from "@/lib/words"
import { base64ToBytes, bytesToBase64 } from "@/yjs/base64"
import { proseText } from "@/yjs/prose"
import { contentState, docFromState, isEmptyContent, replaceContent, sameContent } from "@/yjs/versions"
import { insertRow, type Db, type Tx } from "./tx"

/*
 * Scene versions (DESIGN.md §8 "Snapshots", §12 layer 2): rows in `snapshots` with kind `auto` or `manual`. The
 * same table holds `compaction` rows, which are storage for the live doc, not history, and never show up here.
 */

export type VersionKind = "auto" | "manual"

export interface VersionRow {
  id: string
  kind: VersionKind
  label: string | null
  word_count: number | null
  created_at: string
}

/** A scene's versions, newest first. */
export const VERSIONS_SQL = `
  SELECT id, kind, label, word_count, created_at FROM snapshots
  WHERE scene_id = ? AND kind IN ('auto', 'manual') ORDER BY created_at DESC, id DESC`

/** Automatic versions kept per scene. Named ones stay until the scene is purged. */
export const AUTO_VERSIONS_KEPT = 50

export const BEFORE_RESTORE_LABEL = "Before restoring"

const latestVersion = (tx: Tx, sceneId: string) =>
  tx.getOptional<{ id: string; state_b64: string | null }>(
    `SELECT id, state_b64 FROM snapshots WHERE scene_id = ? AND kind IN ('auto', 'manual')
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [sceneId],
  )

/**
 * Saves the prose of `doc` as a version of the scene and returns its id. An automatic version isn't saved when it
 * would repeat the latest version (whose id comes back instead), or when an empty scene has no versions yet (null).
 * Only the newest AUTO_VERSIONS_KEPT automatic versions are kept.
 */
export async function saveVersion(
  db: Db,
  sceneId: string,
  doc: Y.Doc,
  options: { kind: VersionKind; label?: string; now?: Date },
): Promise<string | null> {
  const { kind, label = "", now = new Date() } = options
  const state = contentState(doc)
  const words = countWords(proseText(doc))
  return db.writeTransaction(async (tx) => {
    if (kind === "auto") {
      const latest = await latestVersion(tx, sceneId)
      if (!latest) {
        if (isEmptyContent(doc)) return null
      } else if (latest.state_b64) {
        const previous = docFromState(base64ToBytes(latest.state_b64))
        const same = sameContent(previous, doc)
        previous.destroy()
        if (same) return latest.id
      }
    }
    const id = newId()
    await insertRow(tx, "snapshots", {
      id,
      scene_id: sceneId,
      state_b64: bytesToBase64(state),
      word_count: words,
      label: label.trim(),
      kind,
      created_at: now.toISOString(),
    })
    if (kind === "auto") {
      await tx.execute(
        `DELETE FROM snapshots WHERE id IN (
           SELECT id FROM snapshots WHERE scene_id = ? AND kind = 'auto'
           ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)`,
        [sceneId, AUTO_VERSIONS_KEPT],
      )
    }
    return id
  })
}

/** A version's prose as a doc of its own (destroy it when done), or null if the version is gone. */
export async function loadVersion(db: Db, versionId: string): Promise<Y.Doc | null> {
  const row = await db.getOptional<{ state_b64: string | null }>(
    "SELECT state_b64 FROM snapshots WHERE id = ? AND kind IN ('auto', 'manual')",
    [versionId],
  )
  return row?.state_b64 ? docFromState(base64ToBytes(row.state_b64)) : null
}

/**
 * Puts a version's prose back into the scene's live doc, after saving the prose it replaces as a version. Returns
 * that version's id, to undo with, or null if the version to restore is gone.
 */
export async function restoreVersion(
  db: Db,
  sceneId: string,
  live: Y.Doc,
  versionId: string,
  origin: unknown,
): Promise<string | null> {
  const version = await loadVersion(db, versionId)
  if (!version) return null
  try {
    const before = await saveVersion(db, sceneId, live, { kind: "auto", label: BEFORE_RESTORE_LABEL })
    replaceContent(live, version, origin)
    return before
  } finally {
    version.destroy()
  }
}
