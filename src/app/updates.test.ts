import type { DownloadEvent } from "@tauri-apps/plugin-updater"
import { beforeEach, expect, test, vi } from "vitest"
import type { UpdateState } from "./updates"

// As built for the desktop app, with Tauri's side and the editor's saving stood in for, noting what's done in turn.
const fake = vi.hoisted(() => {
  const done: string[] = []
  return {
    done,
    check: vi.fn(),
    invoke: vi.fn(async (command: string) => void done.push(`invoke ${command}`)),
    flushSceneDocs: vi.fn(async () => void done.push("flush")),
    settleSceneDocs: vi.fn(async () => void done.push("settle")),
    finishClosingWork: vi.fn(async () => void done.push("closing work")),
  }
})

vi.mock("@tauri-apps/plugin-updater", () => ({ check: fake.check }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: fake.invoke }))
vi.mock("@/editor/sceneDocs", () => ({
  flushSceneDocs: fake.flushSceneDocs,
  settleSceneDocs: fake.settleSceneDocs,
}))
vi.mock("./desktop", () => ({ desktop: true, finishClosingWork: fake.finishClosingWork }))

/** A newer version, as check() finds it: 3 MB, unless its size isn't known. */
function newVersion(size: number | null = 3_000_000) {
  return {
    version: "0.1.2",
    body: "  Faster saving.\n" as string | undefined,
    download: vi.fn(async (onEvent: (event: DownloadEvent) => void) => {
      fake.done.push("download")
      onEvent({ event: "Started", data: { contentLength: size ?? undefined } })
      onEvent({ event: "Progress", data: { chunkLength: 1_000_000 } })
      onEvent({ event: "Progress", data: { chunkLength: 2_000_000 } })
      onEvent({ event: "Finished" })
    }),
    install: vi.fn(async () => void fake.done.push("install")),
  }
}

/** The module as the app first loads it: nothing checked, and Updates open unless said otherwise. */
async function load({ dialogOpen = true } = {}) {
  vi.resetModules()
  const updates = await import("./updates")
  const { useBookDialogs } = await import("@/features/books/dialogStore")
  useBookDialogs.setState({ dialog: dialogOpen ? "updates" : null })
  const seen: UpdateState[] = []
  updates.useUpdates.subscribe((state) => void seen.push(state))
  return { ...updates, useBookDialogs, seen }
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.done.length = 0
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

test("checking finds this is the newest version", async () => {
  const { checkForUpdate, seen } = await load()
  fake.check.mockResolvedValueOnce(null)
  await checkForUpdate()
  expect(fake.check).toHaveBeenCalledWith({ timeout: 30_000 })
  expect(seen.map((state) => state.step)).toEqual(["checking", "latest"])
})

test("checking finds a newer version, with what's new in it", async () => {
  const { checkForUpdate, useUpdates } = await load()
  fake.check.mockResolvedValueOnce(newVersion())
  await checkForUpdate()
  expect(useUpdates.getState()).toEqual({ step: "found", version: "0.1.2", notes: "Faster saving." })
})

test("a release with no notes has none to show", async () => {
  const { checkForUpdate, useUpdates } = await load()
  const found = newVersion()
  found.body = undefined
  fake.check.mockResolvedValueOnce(found)
  await checkForUpdate()
  expect(useUpdates.getState()).toEqual({ step: "found", version: "0.1.2", notes: "" })
})

test("a check that fails says why, and can be tried again", async () => {
  const { checkForUpdate, shouldCheck, useUpdates } = await load()
  fake.check.mockRejectedValueOnce("error sending request for url")
  await checkForUpdate()
  const failed = useUpdates.getState()
  expect(failed).toEqual({ step: "failed", during: "check", message: "error sending request for url" })
  expect(shouldCheck(failed)).toBe(true)
  fake.check.mockResolvedValueOnce(null)
  await checkForUpdate()
  expect(useUpdates.getState().step).toBe("latest")
})

test("once a newer version is found, opening Updates again doesn't look again", async () => {
  const { checkForUpdate, shouldCheck, useUpdates } = await load()
  fake.check.mockResolvedValueOnce(newVersion())
  await checkForUpdate()
  expect(shouldCheck(useUpdates.getState())).toBe(false)
  await checkForUpdate()
  expect(fake.check).toHaveBeenCalledTimes(1)
})

test("with Updates open, it downloads, saves the writer's work, then installs", async () => {
  const { checkForUpdate, installUpdate, useUpdates, seen } = await load()
  fake.check.mockResolvedValueOnce(newVersion())
  await checkForUpdate()
  seen.length = 0
  await installUpdate()
  const downloads = seen.filter((state) => state.step === "downloading")
  expect(downloads.map(({ received, total }) => [received, total])).toEqual([
    [0, null],
    [0, 3_000_000],
    [1_000_000, 3_000_000],
    [3_000_000, 3_000_000],
    [3_000_000, 3_000_000],
  ])
  expect(fake.done).toEqual(["download", "flush", "settle", "closing work", "invoke before_update", "install"])
  // Installing ends the app on Windows; the test's stand-in returns, so the state stays at installing.
  expect(useUpdates.getState()).toEqual({ step: "installing", version: "0.1.2", notes: "Faster saving." })
})

test("a download of unknown size counts what has come", async () => {
  const { checkForUpdate, installUpdate, seen } = await load()
  fake.check.mockResolvedValueOnce(newVersion(null))
  await checkForUpdate()
  await installUpdate()
  const last = seen.findLast((state) => state.step === "downloading")
  expect(last).toMatchObject({ received: 3_000_000, total: null })
})

test("downloaded with Updates closed, it waits to be asked, then installs without downloading again", async () => {
  const { checkForUpdate, installUpdate, useUpdates, useBookDialogs } = await load()
  const found = newVersion()
  fake.check.mockResolvedValueOnce(found)
  await checkForUpdate()
  const downloading = installUpdate()
  // The writer closes Updates to carry on writing.
  useBookDialogs.setState({ dialog: null })
  await downloading
  expect(useUpdates.getState()).toEqual({ step: "ready", version: "0.1.2", notes: "Faster saving." })
  expect(found.install).not.toHaveBeenCalled()
  useBookDialogs.setState({ dialog: "updates" })
  await installUpdate()
  expect(found.download).toHaveBeenCalledTimes(1)
  expect(found.install).toHaveBeenCalledTimes(1)
})

test("a failed download says why, and trying again downloads again", async () => {
  const { checkForUpdate, installUpdate, shouldCheck, useUpdates } = await load()
  const found = newVersion()
  found.download.mockRejectedValueOnce(new Error("connection reset"))
  fake.check.mockResolvedValueOnce(found)
  await checkForUpdate()
  await installUpdate()
  expect(useUpdates.getState()).toEqual({
    step: "failed",
    during: "download",
    message: "connection reset",
    version: "0.1.2",
    notes: "Faster saving.",
  })
  expect(fake.flushSceneDocs).not.toHaveBeenCalled()
  // Opening Updates again looks again, in case the release has changed.
  expect(shouldCheck(useUpdates.getState())).toBe(true)
  await installUpdate()
  expect(found.download).toHaveBeenCalledTimes(2)
  expect(found.install).toHaveBeenCalledTimes(1)
})

test("a failed install says why, and trying again downloads it again", async () => {
  const { checkForUpdate, installUpdate, useUpdates } = await load()
  const found = newVersion()
  found.install.mockRejectedValueOnce("the installer couldn't start")
  fake.check.mockResolvedValueOnce(found)
  await checkForUpdate()
  await installUpdate()
  expect(useUpdates.getState()).toMatchObject({
    step: "failed",
    during: "install",
    message: "the installer couldn't start",
  })
  await installUpdate()
  expect(found.download).toHaveBeenCalledTimes(2)
  expect(found.install).toHaveBeenCalledTimes(2)
})

test("not saving the window's place doesn't stop the install", async () => {
  const { checkForUpdate, installUpdate } = await load()
  const found = newVersion()
  fake.invoke.mockRejectedValueOnce("window not found")
  fake.check.mockResolvedValueOnce(found)
  await checkForUpdate()
  await installUpdate()
  expect(found.install).toHaveBeenCalledTimes(1)
})

test("a second press while it downloads does nothing", async () => {
  const { checkForUpdate, installUpdate } = await load()
  const found = newVersion()
  fake.check.mockResolvedValueOnce(found)
  await checkForUpdate()
  const first = installUpdate()
  await installUpdate()
  await first
  expect(found.download).toHaveBeenCalledTimes(1)
  expect(found.install).toHaveBeenCalledTimes(1)
})

test("installing with nothing found does nothing", async () => {
  const { installUpdate, useUpdates } = await load()
  await installUpdate()
  expect(useUpdates.getState().step).toBe("idle")
  expect(fake.done).toEqual([])
})

test("downloads are counted in megabytes", async () => {
  const { downloadedText } = await load()
  expect(downloadedText(2_100_000, 5_600_000)).toBe("2.1 MB of 5.6 MB")
  expect(downloadedText(6_000_000, 5_600_000)).toBe("5.6 MB of 5.6 MB")
  expect(downloadedText(750_000, null)).toBe("0.8 MB")
})
