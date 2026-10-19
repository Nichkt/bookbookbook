import { useSyncExternalStore } from "react"
import { desktop } from "@/app/desktop"
import { folderState, type FolderPref } from "@/backup/folder"
import { folderBackupsSupported } from "@/backup/handles"
import type { FolderState } from "@/backup/record"
import { folderAccess, permissionShown, subscribeFolderAccess } from "@/backup/scheduler"

export interface Folder {
  /** Whether this browser can write to a folder at all. */
  supported: boolean
  /** True till the folder's note, its handle and the permission to write have been read. */
  loading: boolean
  /** When they were last read, as from Date.now(). */
  checkedAt: number
  state: FolderState
  pref: FolderPref | null
  /** Whether the browser still has the folder. */
  hasHandle: boolean
  /** True while backups run in this tab. */
  running: boolean
}

/** How folder backups stand on this device (DESIGN.md §12). */
export function useFolder(): Folder {
  const access = useSyncExternalStore(subscribeFolderAccess, folderAccess)
  const supported = folderBackupsSupported()
  const hasHandle = access.handle !== null
  return {
    supported,
    loading: !access.loaded,
    checkedAt: access.checkedAt,
    state: supported ? folderState(access.pref, hasHandle, permissionShown(access)) : "off",
    pref: supported ? access.pref : null,
    hasHandle,
    running: access.running,
  }
}

/** Why folder backups have stopped, to follow "Backups to “Name” have stopped: ". */
export function whyStopped(folder: Folder): string {
  if (!folder.hasHandle) return `${desktop ? "bookbookbook" : "this browser"} has lost track of the folder`
  if (folder.pref?.error?.kind === "missing") return "the folder has been moved, renamed or deleted"
  return "something went wrong writing there"
}
