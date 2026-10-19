import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Db } from "@/db/tx"

// One set of spies for every fresh copy of the scheduler below. The folder, "Backups", is one whose permission
// WebView2 forgot as the app last closed.
const spies = vi.hoisted(() => {
  const handle = { name: "Backups" } as unknown as FileSystemDirectoryHandle
  const folder = { permission: "prompt" as PermissionState, answer: "granted" as PermissionState | Error }
  return {
    handle,
    folder,
    askWritePermission: vi.fn(async () => {
      if (folder.answer instanceof Error) throw folder.answer
      folder.permission = folder.answer
      return folder.answer
    }),
    backUpBooks: vi.fn(async () => ({ wrote: [] as string[] })),
  }
})

vi.mock("./handles", () => ({
  folderBackupsSupported: () => true,
  loadFolderHandle: async () => spies.handle,
  writePermission: async () => spies.folder.permission,
  askWritePermission: spies.askWritePermission,
  pickFolder: async () => null,
  saveFolderHandle: async () => undefined,
  forgetFolderHandle: async () => undefined,
}))
vi.mock("./folder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./folder")>()),
  backUpBooks: spies.backUpBooks,
}))
vi.mock("@/db/prefs", () => ({
  readPref: async () => JSON.stringify({ name: "Backups", lastRun: null, error: null }),
  setPref: async () => undefined,
}))
vi.mock("@/editor/sceneDocs", () => ({ flushSceneDocs: async () => undefined, saveWordCounts: async () => undefined }))
vi.mock("@/export/scenes", () => ({ storedSceneReader: () => () => null }))

const db = {} as Db
const userActivation = { isActive: true }
let stop = () => {}

/** The scheduler as a build in `mode` loads it, started, once it has looked at the folder. */
async function start(mode: "desktop" | "production") {
  vi.stubEnv("MODE", mode)
  vi.resetModules()
  const scheduler = await import("./scheduler")
  stop = scheduler.startBackups(db)
  await vi.waitFor(() => expect(scheduler.folderAccess().loaded).toBe(true))
  return scheduler
}

const press = (type = "keydown") => window.dispatchEvent(new Event(type))
/** Lets what the scheduler started run its course. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget())
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }))
  vi.stubGlobal("navigator", { userActivation })
  userActivation.isActive = true
  spies.folder.permission = "prompt"
  spies.folder.answer = "granted"
  spies.askWritePermission.mockClear()
  spies.backUpBooks.mockClear()
})

afterEach(() => {
  stop()
  stop = () => {}
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test("on the desktop, backups don't show as paused for the permission WebView2 forgot as the app closed", async () => {
  const { folderAccess, permissionShown } = await start("desktop")
  expect(folderAccess().permission).toBe("prompt")
  expect(permissionShown(folderAccess())).toBe("granted")
})

test("on the desktop, the writer's first click or key press asks for the permission again", async () => {
  const { folderAccess } = await start("desktop")
  // Escape, say, which the browser doesn't count.
  userActivation.isActive = false
  press()
  expect(spies.askWritePermission).not.toHaveBeenCalled()

  userActivation.isActive = true
  press("mousedown")
  press()
  expect(spies.askWritePermission).toHaveBeenCalledTimes(1)
  await vi.waitFor(() => expect(folderAccess().permission).toBe("granted"))
  await settle()
  // No pass went without it: the first is still to come.
  expect(spies.backUpBooks).not.toHaveBeenCalled()
  press("pointerup")
  expect(spies.askWritePermission).toHaveBeenCalledTimes(1)
})

test("on the desktop, a pass that went without the permission is made up as soon as it's given", async () => {
  const { backUpNow } = await start("desktop")
  expect(await backUpNow(db)).toBe("skipped")
  expect(spies.backUpBooks).toHaveBeenLastCalledWith(db, expect.any(Function), null, expect.any(Date))

  press("pointerup")
  await vi.waitFor(() => expect(spies.backUpBooks).toHaveBeenCalledTimes(2))
  expect(spies.backUpBooks).toHaveBeenLastCalledWith(db, expect.any(Function), spies.handle, expect.any(Date))
})

test("on the desktop, if asking again fails, backups show as paused till the writer allows them", async () => {
  const { allowFolder, folderAccess, permissionShown } = await start("desktop")
  spies.folder.answer = new DOMException("The request was dismissed", "NotAllowedError")
  press()
  await vi.waitFor(() => expect(folderAccess().regrantFailed).toBe(true))
  expect(permissionShown(folderAccess())).toBe("prompt")
  // Not asked again at every key press.
  press()
  expect(spies.askWritePermission).toHaveBeenCalledTimes(1)

  spies.folder.answer = "granted"
  expect(await allowFolder(db)).toBe("up-to-date")
  expect(folderAccess()).toMatchObject({ permission: "granted", regrantFailed: false })

  // Withdrawn again later, it's asked for again at the next key press.
  spies.folder.permission = "prompt"
  document.dispatchEvent(new Event("visibilitychange"))
  await vi.waitFor(() => expect(folderAccess().permission).toBe("prompt"))
  expect(permissionShown(folderAccess())).toBe("granted")
  press()
  expect(spies.askWritePermission).toHaveBeenCalledTimes(3)
})

test("on the web, permission is asked for only when the writer chooses Allow", async () => {
  const { folderAccess, permissionShown } = await start("production")
  expect(permissionShown(folderAccess())).toBe("prompt")
  press()
  press("mousedown")
  press("pointerup")
  expect(spies.askWritePermission).not.toHaveBeenCalled()
})

/** Closes the desktop app's window, as src-tauri/src/lib.rs does, and returns what it waits for. */
function close() {
  const work: Promise<unknown>[] = []
  window.dispatchEvent(new CustomEvent("bookbookbook:closing", { detail: work }))
  return work
}

test("closing the desktop app waits for a last pass", async () => {
  await start("desktop")
  const work = close()
  expect(work).toHaveLength(1)
  await Promise.all(work)
  expect(spies.backUpBooks).toHaveBeenCalledTimes(1)
  stop()
  expect(close()).toEqual([])
})

test("a web page has no closing to wait for", async () => {
  await start("production")
  expect(close()).toEqual([])
})
