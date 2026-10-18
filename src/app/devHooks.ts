import { useTheme, type Theme } from "@/app/theme"
import { backUpNow, type FolderOutcome } from "@/backup/scheduler"
import { db } from "@/db/powersync"
import { flushSceneDocs, openSceneDocs, settleSceneDocs } from "@/editor/sceneDocs"

/** Handles for the end-to-end tests and the console. Development builds only. */
export interface DevHooks {
  db: typeof db
  /** Scene ids with a live doc in this tab. */
  openScenes(): string[]
  /** Resolves once every local edit in this tab has been written. */
  flushAll(): Promise<void>
  /** Folds each open scene's update rows into one snapshot. */
  compactAll(): Promise<void>
  /** Saves pending word counts and versions now, instead of after their delays. */
  settleAll(): Promise<void>
  /** Runs a backup pass now, rather than waiting for the next: checks every book, and writes to the folder. */
  backUpNow(): Promise<FolderOutcome>
  /** Switches the theme as the header's Theme control does, leaving open whatever's open. */
  setTheme(theme: Theme): void
}

declare global {
  interface Window {
    __bbb?: DevHooks
  }
}

export function installDevHooks() {
  window.__bbb = {
    db,
    openScenes: () => openSceneDocs().map((provider) => provider.sceneId),
    flushAll: flushSceneDocs,
    async compactAll() {
      await Promise.all(openSceneDocs().map((provider) => provider.compact()))
    },
    settleAll: settleSceneDocs,
    backUpNow: () => backUpNow(db),
    setTheme: (theme) => useTheme.getState().setTheme(theme),
  }
}
