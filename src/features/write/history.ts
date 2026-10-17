import { diffWordsWithSpace, type ChangeObject } from "diff"
import { create } from "zustand"
import { localDay } from "@/db/stats"
import type { VersionRow } from "@/db/versions"
import { countWords } from "@/lib/words"

/*
 * Scene history (DESIGN.md §8 "Snapshots"): which scene the History dialog shows, and how versions read on screen.
 * Saving and restoring live in historyActions.ts.
 */

interface HistoryDialogState {
  sceneId: string | null
  /** The scene's name, for the dialog's title. */
  sceneName: string
  /** What to focus when the dialog closes: the control that opened it. */
  returnFocus: HTMLElement | null
}

/** Which scene's History dialog is open. The toolbar and each scene's ⋯ menu open it. */
export const useHistoryDialog = create<HistoryDialogState>(() => ({ sceneId: null, sceneName: "", returnFocus: null }))

export const openHistory = (sceneId: string, sceneName: string, returnFocus: HTMLElement | null) =>
  useHistoryDialog.setState({ sceneId, sceneName, returnFocus })

export const closeHistory = () => useHistoryDialog.setState({ sceneId: null })

/** A version's name in the list: the writer's, else "Snapshot" or "Automatic". */
export function versionName(version: Pick<VersionRow, "kind" | "label">) {
  const label = version.label?.trim()
  if (label) return label
  return version.kind === "manual" ? "Snapshot" : "Automatic"
}

/** "today at 3:42 PM", "yesterday at 9:05 AM", "Mar 4 at 3:42 PM", with the year when it isn't this one. */
export function formatWhen(iso: string, now = new Date(), locale?: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  const day = localDay(date)
  if (day === localDay(now)) return `today at ${time}`
  if (day === localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `yesterday at ${time}`
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric", year })} at ${time}`
}

export interface RestoreDiff {
  /** The current text, with what a restore would add and remove marked. null when they're too different to mark. */
  parts: ChangeObject<string>[] | null
  /** Words a restore would bring back. */
  added: number
  /** Words a restore would take out. */
  removed: number
}

/** Beyond this many word-level edits, or this long, comparing stops: the marks would no longer help. */
const MAX_EDITS = 2000
const MAX_MS = 300

/** What restoring a version with text `version` over the scene's `current` text would change. */
export function restoreDiff(current: string, version: string): RestoreDiff {
  const parts = diffWordsWithSpace(current, version, { maxEditLength: MAX_EDITS, timeout: MAX_MS })
  if (!parts) return { parts: null, added: 0, removed: 0 }
  let added = 0
  let removed = 0
  for (const part of parts) {
    if (part.added) added += countWords(part.value)
    else if (part.removed) removed += countWords(part.value)
  }
  return { parts, added, removed }
}

/** A run of text in the comparison: unchanged, or what a restore would bring back or take out. */
export interface DiffPiece {
  text: string
  change?: "added" | "removed"
}

/**
 * The comparison split into paragraphs, so it reads like the scene. Blank lines, such as scene breaks, stay as empty
 * paragraphs. A paragraph break that a restore would add or take out splits the paragraph too.
 */
export function diffParagraphs(parts: Pick<ChangeObject<string>, "value" | "added" | "removed">[]): DiffPiece[][] {
  const paragraphs: DiffPiece[][] = [[]]
  for (const part of parts) {
    const change = part.added ? "added" : part.removed ? "removed" : undefined
    part.value.split("\n").forEach((line, index) => {
      if (index > 0) paragraphs.push([])
      if (line) paragraphs[paragraphs.length - 1].push(change ? { text: line, change } : { text: line })
    })
  }
  return paragraphs
}

/**
 * Ctrl+Alt+S, or ⌘⌥S on a Mac, saves a snapshot (DESIGN.md §8 "Keyboard"). Windows reports AltGr as Ctrl+Alt, and
 * AltGr+S types a letter on some layouts, so that's left alone. The key code catches ⌥S, which types "ß" on a Mac.
 */
export const isSnapshotShortcut = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) &&
  event.altKey &&
  !event.shiftKey &&
  !event.getModifierState("AltGraph") &&
  (event.code === "KeyS" || event.key.toLowerCase() === "s")
