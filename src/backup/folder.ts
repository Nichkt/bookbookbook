import { readPref, setPref } from "@/db/prefs"
import type { Db } from "@/db/tx"
import { zipBackup } from "@/export/backup"
import type { SceneReader } from "@/export/scenes"
import type { FolderState } from "./record"
import { checkBook, recordBackup, type CheckedBook } from "./state"

/*
 * Folder backups (DESIGN.md §12). Where the browser lets a page write to a folder (Chrome and Edge on computers),
 * the writer can choose one, best one a cloud drive syncs, and each book's backup is written there whenever the
 * book has changed. The newest ten of each book are kept. Only files written here are ever replaced or removed.
 */

/** The folder, as noted on this device: `{name, lastRun, error}`. The folder's handle is kept in IndexedDB. */
export const FOLDER_KEY = "backup.folder"
/** The backups written to the folder for a book: `{hash, files}`. */
export const filesKey = (bookId: string) => `backup.files:${bookId}`
/** Backups kept of each book. */
export const KEEP_PER_BOOK = 10

const SUFFIX = ".bookbookbook.zip"
const MAX_NAME_TRIES = 100

export interface FolderError {
  /** `missing`: the folder has gone, moved or been renamed. `failed`: anything else. */
  kind: "missing" | "failed"
  message?: string
}

export interface FolderPref {
  name: string
  /** When a pass last finished with every book in the folder as it stood. */
  lastRun: string | null
  /** What went wrong last time, till a pass goes right. */
  error: FolderError | null
}

/** What folder backups need of a FileSystemDirectoryHandle, so the tests can pass a stand-in. */
export interface BackupDir {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<BackupWritable> }>
  removeEntry(name: string): Promise<void>
}

export interface BackupWritable {
  write(data: Uint8Array<ArrayBuffer> | string): Promise<void>
  close(): Promise<void>
  abort(reason?: unknown): Promise<void>
}

/** The backups written for a book: the fingerprint of the last, and their names, oldest first. */
interface BookFiles {
  hash: string | null
  files: string[]
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    return asObject(JSON.parse(value))
  } catch {
    return null
  }
}

export function parseFolderPref(value: string | null): FolderPref | null {
  const parsed = parseObject(value)
  if (typeof parsed?.name !== "string") return null
  const error = asObject(parsed.error)
  const kind = error?.kind
  return {
    name: parsed.name,
    lastRun: typeof parsed.lastRun === "string" && Number.isFinite(Date.parse(parsed.lastRun)) ? parsed.lastRun : null,
    error:
      kind === "missing" || kind === "failed"
        ? { kind, ...(typeof error?.message === "string" && { message: error.message }) }
        : null,
  }
}

function parseFiles(value: string | null): BookFiles {
  const parsed = parseObject(value)
  const files = Array.isArray(parsed?.files) ? parsed.files : []
  return {
    hash: typeof parsed?.hash === "string" ? parsed.hash : null,
    files: files.filter((file): file is string => typeof file === "string"),
  }
}

/** How folder backups stand: from the note, whether the browser still has the folder, and the permission to write. */
export function folderState(pref: FolderPref | null, hasHandle: boolean, permission: PermissionState | null): FolderState {
  if (!pref) return "off"
  if (!hasHandle || pref.error) return "stopped"
  return permission === "granted" ? "on" : "paused"
}

const errorName = (error: unknown) =>
  typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : ""

const errorMessage = (error: unknown) =>
  typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message
    ? error.message
    : String(error)

/** What went wrong, to note. Nothing for permission withdrawn: that pauses backups rather than stopping them. */
export function folderErrorOf(error: unknown): FolderError | null {
  const name = errorName(error)
  if (name === "NotAllowedError") return null
  if (name === "NotFoundError") return { kind: "missing" }
  return { kind: "failed", message: errorMessage(error) }
}

/** The folder's note after a pass that wrote to it, or tried to and hit `error`. */
export function afterPass(pref: FolderPref, error: { cause: unknown } | undefined, now: Date): FolderPref {
  if (!error) return { ...pref, lastRun: now.toISOString(), error: null }
  const folderError = folderErrorOf(error.cause)
  return folderError ? { ...pref, error: folderError } : pref
}

/** `name`, or for n > 1 `name (n)`, with the number before the extension. */
export function numbered(name: string, n: number): string {
  if (n === 1) return name
  const at = name.endsWith(SUFFIX) ? name.length - SUFFIX.length : name.length
  return `${name.slice(0, at)} (${n})${name.slice(at)}`
}

async function exists(dir: BackupDir, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch (error) {
    const kind = errorName(error)
    if (kind === "NotFoundError") return false
    // A folder by that name.
    if (kind === "TypeMismatchError") return true
    throw error
  }
}

/** The first of `name`, `name (2)`… that's ours to replace, or free. Anything else by that name is in the way. */
async function freeName(dir: BackupDir, name: string, ours: readonly string[]): Promise<string> {
  for (let n = 1; n <= MAX_NAME_TRIES; n++) {
    const candidate = numbered(name, n)
    if (ours.includes(candidate) || !(await exists(dir, candidate))) return candidate
  }
  throw new Error(`The folder has too many files named like “${name}”.`)
}

/** Writes the file whole or not at all: the browser writes to a copy, and swaps it in on close. */
async function writeFile(dir: BackupDir, name: string, data: Uint8Array<ArrayBuffer> | string, isNew: boolean) {
  const file = await dir.getFileHandle(name, { create: true })
  try {
    const writable = await file.createWritable()
    try {
      await writable.write(data)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => undefined)
      throw error
    }
  } catch (error) {
    // Rather than leave an empty file where a backup should be.
    if (isNew) await dir.removeEntry(name).catch(() => undefined)
    throw error
  }
}

async function removeFile(dir: BackupDir, name: string) {
  try {
    await dir.removeEntry(name)
  } catch (error) {
    if (errorName(error) !== "NotFoundError") throw error
  }
}

/** Those of `names` still in the folder. */
async function stillThere(dir: BackupDir, names: readonly string[]): Promise<string[]> {
  const found: string[] = []
  for (const name of names) if (await exists(dir, name)) found.push(name)
  return found
}

/** Writes the book's backup to the folder, unless the folder has it as it stands. Returns whether it wrote one. */
export async function backUpToFolder(
  db: Db,
  dir: BackupDir,
  bookId: string,
  checked: CheckedBook,
  readScene: SceneReader,
  now = new Date(),
): Promise<boolean> {
  const key = filesKey(bookId)
  const noted = parseFiles(await readPref(db, key))
  let files = noted.files
  if (noted.hash === checked.hash) {
    const newest = files.at(-1)
    if (newest !== undefined && (await exists(dir, newest))) {
      // A backup made since, then undone: the folder still has the book as it stands.
      if (checked.record.hash !== checked.hash) await recordBackup(db, bookId, checked, now)
      return false
    }
    // The writer has moved or deleted it, or the whole folder, perhaps to make it anew.
    files = await stillThere(dir, files)
  }
  const zip = await zipBackup(db, checked.backup, readScene)
  const name = await freeName(dir, zip.name, files)
  await writeFile(dir, name, zip.data as Uint8Array<ArrayBuffer> | string, !files.includes(name))
  const written = [...files.filter((file) => file !== name), name]
  await setPref(db, key, JSON.stringify({ hash: checked.hash, files: written }))
  await recordBackup(db, bookId, checked, now)
  if (written.length > KEEP_PER_BOOK) {
    for (const file of written.slice(0, -KEEP_PER_BOOK)) await removeFile(dir, file)
    await setPref(db, key, JSON.stringify({ hash: checked.hash, files: written.slice(-KEEP_PER_BOOK) }))
  }
  return true
}

export interface PassResult {
  /** The books whose backups were written. */
  wrote: string[]
  /** What stopped the writing, if anything did. */
  error?: { cause: unknown }
}

/**
 * Checks every book outside the Trash, noting in each record whether it has changed since its last backup, and
 * given a folder, writes the backups it lacks. A folder error stops the writing, but not the checks.
 */
export async function backUpBooks(db: Db, readScene: SceneReader, dir: BackupDir | null, now = new Date()): Promise<PassResult> {
  const books = await db.getAll<{ id: string }>("SELECT id FROM books WHERE deleted_at IS NULL ORDER BY created_at, id")
  const result: PassResult = { wrote: [] }
  for (const { id } of books) {
    let checked: CheckedBook
    try {
      checked = await checkBook(db, id, readScene, now)
    } catch (error) {
      // One book that can't be read mustn't keep the rest from being backed up.
      console.error(`[backups] Couldn't check book ${id}`, error)
      continue
    }
    if (!dir || result.error) continue
    try {
      if (await backUpToFolder(db, dir, id, checked, readScene, now)) result.wrote.push(id)
    } catch (cause) {
      result.error = { cause }
    }
  }
  return result
}

/** Forgets the backups written to the folder: for a new folder, or none. */
export async function forgetFolderFiles(db: Db) {
  await db.execute("DELETE FROM ui_prefs WHERE id LIKE 'backup.files:%'")
}
