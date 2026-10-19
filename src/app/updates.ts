import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater"
import { create } from "zustand"
import { flushSceneDocs, settleSceneDocs } from "@/editor/sceneDocs"
import { useBookDialogs } from "@/features/books/dialogStore"
import { desktop, finishClosingWork } from "./desktop"

/*
 * New versions of the desktop app, from its releases on GitHub (DESIGN.md §11), when the writer asks: Check for
 * updates, on the home screen, in the book menu or the palette, opens Updates (src/features/updates/). A new version
 * downloads, then the app saves the writer's work and closes, and its installer puts the new version in and opens it.
 * Each release has a latest.json, which says which version is newest, with the installer's signature: the app checks
 * it with the key in tauri.conf.json, so installs only what the key's owner built. The web app updates itself (pwa.ts).
 */

/** Every version, with what changed in each. */
export const RELEASES_URL = "https://github.com/Nichkt/bookbookbook/releases"

/** The version running. */
export const APP_VERSION = __APP_VERSION__

/** A newer version than this one. */
export interface NewVersion {
  version: string
  /** What's new in it, as its release says, in plain text. */
  notes: string
}

/** How far updating has got. */
export type UpdateState =
  /** Not checked since the app opened. */
  | { step: "idle" }
  | { step: "checking" }
  /** This is the newest version. */
  | { step: "latest" }
  /** A newer version is out. */
  | ({ step: "found" } & NewVersion)
  /** Bytes so far, and of how many if GitHub said. */
  | ({ step: "downloading"; received: number; total: number | null } & NewVersion)
  /** Downloaded while Updates was closed: it waits for the writer to say, as they may be mid-sentence. */
  | ({ step: "ready" } & NewVersion)
  /** Saving the writer's work, then starting the installer, which closes the app. */
  | ({ step: "installing" } & NewVersion)
  | { step: "failed"; during: "check"; message: string }
  | ({ step: "failed"; during: "download" | "install"; message: string } & NewVersion)

export const useUpdates = create<UpdateState>(() => ({ step: "idle" }))

const set = (state: UpdateState) => useUpdates.setState(state, true)

/** How long a check waits for GitHub. */
const CHECK_TIMEOUT_MS = 30_000

/** The newer version found, which keeps its download on Tauri's side. */
let update: Update | null = null

const about = (found: Update): NewVersion => ({ version: found.version, notes: found.body?.trim() ?? "" })

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Whether Updates looks for a new version as it opens: not while one's found, or on its way in. After something
 * fails, it looks again, as the release may have changed since.
 */
export const shouldCheck = (state: UpdateState) =>
  state.step === "idle" || state.step === "latest" || state.step === "failed"

/** Asks GitHub which version is newest. */
export async function checkForUpdate() {
  if (!desktop || !shouldCheck(useUpdates.getState())) return
  set({ step: "checking" })
  try {
    const { check } = await import("@tauri-apps/plugin-updater")
    update = await check({ timeout: CHECK_TIMEOUT_MS })
    set(update ? { step: "found", ...about(update) } : { step: "latest" })
  } catch (error) {
    console.error("[updates] checking", error)
    set({ step: "failed", during: "check", message: messageOf(error) })
  }
}

/**
 * Downloads the new version, then saves the writer's work and installs it, which closes the app and opens the new
 * version. If Updates was closed by the time it downloaded, it waits to be asked again. Downloading checks the file
 * against the key that signed it, so one that breaks off, or isn't what was signed, fails there.
 */
export async function installUpdate() {
  const found = update
  const state = useUpdates.getState()
  if (!desktop || !found || state.step === "checking" || state.step === "downloading" || state.step === "installing") {
    return
  }
  const next = about(found)
  if (state.step !== "ready") {
    try {
      await download(found, next)
    } catch (error) {
      console.error("[updates] downloading", error)
      return set({ step: "failed", during: "download", message: messageOf(error), ...next })
    }
    if (useBookDialogs.getState().dialog !== "updates") return set({ step: "ready", ...next })
  }
  set({ step: "installing", ...next })
  try {
    await saveBeforeInstalling()
    // On Windows, this starts the installer and ends the app, so it returns only if something went wrong.
    await found.install()
  } catch (error) {
    console.error("[updates] installing", error)
    // Trying again downloads it again.
    set({ step: "failed", during: "install", message: messageOf(error), ...next })
  }
}

async function download(found: Update, next: NewVersion) {
  let received = 0
  let total: number | null = null
  set({ step: "downloading", ...next, received, total })
  await found.download((event: DownloadEvent) => {
    if (event.event === "Started") total = event.data.contentLength || null
    else if (event.event === "Progress") received += event.data.chunkLength
    set({ step: "downloading", ...next, received, total })
  })
}

/**
 * What closing the window would see to, as the installer ends the app at once: the writing, its word counts and
 * versions, the closing work, like a last backup, and the window's place, for the new version to open there.
 */
async function saveBeforeInstalling() {
  await flushSceneDocs()
  await settleSceneDocs()
  await finishClosingWork()
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("before_update").catch((error: unknown) => console.error("[updates] saving the window's place", error))
}

const sizeFormat = new Intl.NumberFormat(undefined, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })

/** "2.1 MB of 5.6 MB", or "2.1 MB" if the total isn't known. */
export function downloadedText(received: number, total: number | null) {
  const megabytes = (bytes: number) => sizeFormat.format(bytes / 1_000_000)
  return total ? `${megabytes(Math.min(received, total))} of ${megabytes(total)}` : megabytes(received)
}
