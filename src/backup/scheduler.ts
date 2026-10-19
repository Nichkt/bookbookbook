import { beforeClosing, desktop } from "@/app/desktop"
import { readPref, setPref } from "@/db/prefs"
import type { Db } from "@/db/tx"
import { flushSceneDocs, saveWordCounts } from "@/editor/sceneDocs"
import { storedSceneReader } from "@/export/scenes"
import { afterPass, backUpBooks, FOLDER_KEY, forgetFolderFiles, parseFolderPref, type FolderPref } from "./folder"
import {
  askWritePermission,
  folderBackupsSupported,
  forgetFolderHandle,
  loadFolderHandle,
  pickFolder,
  saveFolderHandle,
  writePermission,
} from "./handles"

/*
 * When backups happen (DESIGN.md §12). A pass checks every book, noting which have changed since their last
 * backup, and writes the backups the folder lacks, if there's a folder to write to. Passes run half a minute after
 * the app opens, hourly, and when the writer leaves the tab, at most every five minutes. Passes, downloads,
 * restores and changes to the folder take turns over every tab, so none undoes what another notes.
 *
 * The desktop app's WebView2 forgets the permission to write to the folder as the app closes, and gives it again
 * only at a click or the like. So there, it's asked for again at the writer's first click or key press, and given
 * without a word (src-tauri/src/lib.rs): the folder is one they chose for the app. Until then, backups show as on.
 * And closing the app, the way a writer leaves it there, waits for a pass, however recent the last.
 */

const FIRST_PASS_MS = 30_000
const PASS_EVERY_MS = 60 * 60_000
const LEAVING_GAP_MS = 5 * 60_000
const LOCK = "bookbookbook:backups"

export interface FolderAccess {
  /** False till the folder has been looked for. */
  loaded: boolean
  /** When it was last looked for, as from Date.now(). */
  checkedAt: number
  /** The folder's note on this device. Kept here with the handle and permission, so all three change together. */
  pref: FolderPref | null
  handle: FileSystemDirectoryHandle | null
  /** Whether the page may write to the folder, when there is one. */
  permission: PermissionState | null
  /** True while a pass runs in this tab. */
  running: boolean
  /** On the desktop, true once asking for the permission again didn't get it, until it's next given. */
  regrantFailed: boolean
}

type Found = Pick<FolderAccess, "pref" | "handle" | "permission">

let access: FolderAccess = {
  loaded: false,
  checkedAt: 0,
  pref: null,
  handle: null,
  permission: null,
  running: false,
  regrantFailed: false,
}
const listeners = new Set<() => void>()

function setAccess(patch: Partial<FolderAccess>) {
  access = { ...access, ...patch }
  for (const listener of listeners) listener()
}

/** For useSyncExternalStore. */
export function subscribeFolderAccess(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const folderAccess = () => access

/** The permission to write to the folder, as the writer is shown it. On the desktop, "prompt" is as good as given. */
export function permissionShown({ permission, regrantFailed }: FolderAccess): PermissionState | null {
  return desktop && permission === "prompt" && !regrantFailed ? "granted" : permission
}

let lookups = 0

/**
 * Reads the folder's note, its handle and the permission to write to it, again, and returns them. This tab's own
 * changes are read as they're made; another tab's, when the writer comes back to this one, or at the next pass.
 */
export async function refreshFolderAccess(db: Db): Promise<Found> {
  const lookup = ++lookups
  const found: Found = { pref: null, handle: null, permission: null }
  if (folderBackupsSupported()) {
    found.pref = await readPref(db, FOLDER_KEY).then(parseFolderPref, (error: unknown) => {
      console.error("[backups] Couldn't read the folder's note", error)
      return access.pref
    })
    found.handle = await loadFolderHandle().catch((error: unknown) => {
      console.error("[backups] Couldn't read the folder's handle", error)
      return null
    })
    if (found.handle) found.permission = await writePermission(found.handle)
  }
  // A later lookup knows better.
  if (lookup === lookups) {
    const regrantFailed = access.regrantFailed && found.permission !== "granted"
    setAccess({ loaded: true, checkedAt: Date.now(), ...found, regrantFailed })
  }
  return found
}

/** Runs `work` once no tab is running a pass or changing the folder, and holds them off till it's done. */
export async function withBackupLock<T>(work: () => Promise<T>): Promise<Awaited<T>> {
  if (!navigator.locks) return await work()
  return navigator.locks.request(LOCK, work)
}

let lastPass = 0
/** Whether the last pass left the folder be for want of permission to write there, to make up once it's given. */
let missedFolder = false

/** What a pass did with the folder: brought it up to date, failed to, or had none it could write to. */
export type FolderOutcome = "up-to-date" | "failed" | "skipped"

async function pass(db: Db): Promise<FolderOutcome> {
  setAccess({ running: true })
  try {
    await flushSceneDocs()
    await saveWordCounts()
    const { pref, handle, permission } = await refreshFolderAccess(db)
    // A folder that failed last time is tried again, in case what was wrong has been put right.
    const dir = pref && handle && permission === "granted" ? handle : null
    missedFolder = pref !== null && handle !== null && !dir
    const now = new Date()
    const result = await backUpBooks(db, storedSceneReader(db), dir, now)
    if (pref && dir) {
      const next = afterPass(pref, result.error, now)
      if (next !== pref) await setPref(db, FOLDER_KEY, JSON.stringify(next))
      // So how it went shows by the time the pass is done; and permission withdrawn, as paused.
      await refreshFolderAccess(db)
    }
    if (result.error) {
      // A warning: the writer is shown what went wrong, and folders do go missing.
      console.warn("[backups] Couldn't write to the backup folder", result.error.cause)
      return "failed"
    }
    return dir ? "up-to-date" : "skipped"
  } finally {
    lastPass = Date.now()
    setAccess({ running: false })
  }
}

/** A pass now. For the writer's own requests: it waits its turn, where a timed pass would skip it. */
export function backUpNow(db: Db): Promise<FolderOutcome> {
  return withBackupLock(() => pass(db))
}

/** A pass now, unless one is running, here or in another tab. */
function timedPass(db: Db) {
  if (access.running) return
  const run = navigator.locks
    ? navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => (lock ? pass(db) : undefined))
    : pass(db)
  run.catch((error: unknown) => console.error("[backups]", error))
}

/** The events that make a click or key press, which the browser asks of a request for permission. */
const GESTURES = ["keydown", "mousedown", "pointerup"] as const

let regranting = false

/** On the desktop: asks for the permission to write to the folder again, then makes up a pass that went without. */
async function regrant(db: Db, handle: FileSystemDirectoryHandle) {
  regranting = true
  try {
    const permission = await askWritePermission(handle).catch((error: unknown) => {
      console.warn("[backups] Couldn't get permission to write to the folder again", error)
      return "denied" as const
    })
    // First, so backups go from on to paused, not on to paused to on.
    if (permission !== "granted") setAccess({ regrantFailed: true })
    await refreshFolderAccess(db)
    if (permission === "granted") await withBackupLock(async () => (missedFolder ? await pass(db) : null))
  } finally {
    regranting = false
  }
}

/** Starts the passes. Returns a function that stops them. */
export function startBackups(db: Db): () => void {
  void refreshFolderAccess(db)
  const first = setTimeout(() => timedPass(db), FIRST_PASS_MS)
  const hourly = setInterval(() => timedPass(db), PASS_EVERY_MS)
  const onVisibilityChange = () => {
    // The permission may have changed while the writer was away: Chrome takes back "Allow this time" after five
    // minutes in the background. Another tab may have changed the folder. On the document, so the reminder, listening
    // on the window, has begun the writer's new spell first, and knows this look is for it.
    if (document.visibilityState === "visible") void refreshFolderAccess(db)
    else if (Date.now() - lastPass >= LEAVING_GAP_MS) timedPass(db)
  }
  document.addEventListener("visibilitychange", onVisibilityChange)
  const onGesture = () => {
    const { pref, handle, permission, regrantFailed } = access
    if (!pref || !handle || permission !== "prompt" || regrantFailed || regranting) return
    // Escape, say, doesn't count.
    if (navigator.userActivation && !navigator.userActivation.isActive) return
    regrant(db, handle).catch((error: unknown) => console.error("[backups]", error))
  }
  // On the window, as the event sets out, so nothing of the page's can stop it.
  if (desktop) for (const type of GESTURES) window.addEventListener(type, onGesture, true)
  // Closing is how a writer leaves the desktop app: it waits for a last pass.
  const stopClosing = desktop ? beforeClosing(() => backUpNow(db)) : null
  return () => {
    clearTimeout(first)
    clearInterval(hourly)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    if (desktop) for (const type of GESTURES) window.removeEventListener(type, onGesture, true)
    stopClosing?.()
  }
}

/** Asks for a folder, then backs every book up to it. Null if the writer thought better of it. */
export async function chooseFolder(db: Db): Promise<FolderOutcome | null> {
  // First, while the click that asked for it still counts: the browser shows the picker for nothing less.
  const handle = await pickFolder()
  if (!handle) return null
  await withBackupLock(async () => {
    const previous = await loadFolderHandle().catch(() => null)
    const same = previous ? await previous.isSameEntry(handle).catch(() => false) : false
    await saveFolderHandle(handle)
    // The backups written to another folder aren't in this one to replace or prune.
    if (!same) await forgetFolderFiles(db)
    const pref: FolderPref = { name: handle.name, lastRun: null, error: null }
    await setPref(db, FOLDER_KEY, JSON.stringify(pref))
    await refreshFolderAccess(db)
  })
  return backUpNow(db)
}

/** Asks for permission to write to the folder, if need be, then backs up to it. Null if it isn't given. */
export async function allowFolder(db: Db): Promise<FolderOutcome | null> {
  const { handle } = access
  if (!handle) return null
  const permission = await askWritePermission(handle)
  await refreshFolderAccess(db)
  if (permission !== "granted") return null
  return backUpNow(db)
}

/** Stops folder backups. What they wrote stays in the folder. */
export async function stopFolder(db: Db) {
  await withBackupLock(async () => {
    // The note first: without it, folder backups are off, where a note without a handle would show them stopped.
    await db.execute("DELETE FROM ui_prefs WHERE id = ?", [FOLDER_KEY])
    await forgetFolderHandle()
    await forgetFolderFiles(db)
    await refreshFolderAccess(db)
  })
}
