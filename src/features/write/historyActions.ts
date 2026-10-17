import { toast } from "sonner"
import { announce, attempt, UNDO_MS } from "@/app/feedback"
import type { Db } from "@/db/tx"
import { restoreVersion, saveVersion, type VersionRow } from "@/db/versions"
import { withSceneDoc } from "@/editor/sceneDocs"
import { formatWhen } from "./history"

/** The origin of a restore's edit. The editor's own undo only tracks typing, hence the toast's Undo. */
export const RESTORE_ORIGIN = Symbol("restore-version")

/** Saves the scene as it is now as a version the writer asked for, optionally named. Resolves to its id. */
export async function takeSnapshot(db: Db, sceneId: string, sceneName: string, name = "") {
  const id = await attempt(
    "snapshot",
    withSceneDoc(sceneId, (provider) => saveVersion(db, sceneId, provider.doc, { kind: "manual", label: name })),
  )
  if (!id) return undefined
  const named = name.trim()
  toast(named ? `Saved “${named}”, a snapshot of ${sceneName}` : `Saved a snapshot of ${sceneName}`)
  return id
}

/**
 * Puts a version's text back in the scene, after saving the text it replaces as a version. The toast's Undo puts
 * that back the same way, so nothing is ever lost to a restore. `sceneName` is as `sceneNameIn` gives it.
 */
export async function restoreWithUndo(db: Db, sceneId: string, version: VersionRow, sceneName: string) {
  const restore = (versionId: string) =>
    withSceneDoc(sceneId, (provider) => restoreVersion(db, sceneId, provider.doc, versionId, RESTORE_ORIGIN))
  const before = await attempt("restore version", restore(version.id))
  if (before === undefined) return
  if (before === null) {
    toast.error("That version is gone, so nothing changed.")
    return
  }
  const label = version.label?.trim()
  const which = label ? `“${label}”` : `the version from ${formatWhen(version.created_at)}`
  toast(`Restored ${sceneName} to ${which}`, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => void attempt("undo restore", restore(before).then(() => announce("Undone"))),
    },
  })
}
