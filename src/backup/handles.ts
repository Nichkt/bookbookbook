/*
 * The backup folder's handle, which only IndexedDB can keep, and the browser's permission to write to the folder
 * (DESIGN.md §12). Chrome and Edge on computers have folders to offer; elsewhere, folder backups aren't offered.
 */

const DB_NAME = "bookbookbook-backups"
const STORE = "handles"
const FOLDER = "folder"
const READ_WRITE = { mode: "readwrite" } as const

/** The parts of the File System Access API that TypeScript's DOM types leave out. */
interface PermissionHandle {
  queryPermission?(descriptor: typeof READ_WRITE): Promise<PermissionState>
  requestPermission?(descriptor: typeof READ_WRITE): Promise<PermissionState>
}

declare global {
  interface Window {
    showDirectoryPicker?(options?: {
      id?: string
      mode?: "read" | "readwrite"
      startIn?: "desktop" | "documents" | "downloads"
    }): Promise<FileSystemDirectoryHandle>
  }
}

export const folderBackupsSupported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function"

/** Asks the writer for a folder to back up to. Null if they think better of it. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({ id: "bookbookbook-backups", mode: "readwrite", startIn: "documents" })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null
    throw error
  }
}

/** Whether the page may write to the folder now. Browsers forget the permission, as a rule, once the app is closed. */
export async function writePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const { queryPermission } = handle as PermissionHandle
  if (!queryPermission) return "granted"
  try {
    return await queryPermission.call(handle, READ_WRITE)
  } catch {
    return "prompt"
  }
}

/** Asks the writer for permission to write to the folder. Must be called from a click, or the like. */
export async function askWritePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const { requestPermission } = handle as PermissionHandle
  if (!requestPermission) return "granted"
  return requestPermission.call(handle, READ_WRITE)
}

function openHandles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function inStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const handles = await openHandles()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = handles.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? request.error)
      transaction.onabort = () => reject(transaction.error ?? request.error)
    })
  } finally {
    handles.close()
  }
}

export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const value: unknown = await inStore("readonly", (store) => store.get(FOLDER))
  return typeof FileSystemDirectoryHandle !== "undefined" && value instanceof FileSystemDirectoryHandle ? value : null
}

export async function saveFolderHandle(handle: FileSystemDirectoryHandle) {
  await inStore("readwrite", (store) => store.put(handle, FOLDER))
}

export async function forgetFolderHandle() {
  await inStore("readwrite", (store) => store.delete(FOLDER))
}
