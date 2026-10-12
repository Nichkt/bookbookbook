import { db } from "@/db/powersync"
import { openSceneDocs } from "@/editor/sceneDocs"

/** Handles for the end-to-end tests and the console. Development builds only. */
export interface DevHooks {
  db: typeof db
  /** Scene ids with a live doc in this tab. */
  openScenes(): string[]
  /** Resolves once every local edit in this tab has been written. */
  flushAll(): Promise<void>
  /** Folds each open scene's update rows into one snapshot. */
  compactAll(): Promise<void>
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
    async flushAll() {
      await Promise.all(openSceneDocs().map((provider) => provider.flush()))
    },
    async compactAll() {
      await Promise.all(openSceneDocs().map((provider) => provider.compact()))
    },
  }
}
