import * as Y from "yjs"
import { db } from "@/db/powersync"
import { createPowerSyncSceneStore } from "@/db/powersyncSceneStore"
import { deviceId, localDay, recordWordCount } from "@/db/stats"
import { saveVersion } from "@/db/versions"
import { countWords } from "@/lib/words"
import { SceneDocProvider } from "@/yjs/SceneDocProvider"
import { proseText } from "@/yjs/prose"
import type { SceneStore } from "@/yjs/sceneStore"
import { docFromState } from "@/yjs/versions"

/** A released doc lingers this long, so StrictMode remounts and quick back-and-forth navigation reuse it. */
const RELEASE_DELAY_MS = 1500
/** Word counts are a projection of the prose (DESIGN.md §5), saved once typing pauses. */
const WORD_COUNT_DELAY_MS = 1000
/** While a scene is being edited, an automatic version this often (DESIGN.md §8 "Snapshots"). */
const VERSION_EVERY_MS = 10 * 60_000

interface OpenScene {
  provider: SceneDocProvider
  refs: number
  releaseTimer?: ReturnType<typeof setTimeout>
  wordsTimer?: ReturnType<typeof setTimeout>
  /**
   * The doc as it loaded, kept until the first edit made here saves it as a version: the text as it was before
   * this sitting, even when the last one ended by closing the tab. null once used.
   */
  baseline?: Uint8Array | null
  /** Set while edits made here aren't in a version yet: fires the next automatic one. */
  versionTimer?: ReturnType<typeof setTimeout>
}

const open = new Map<string, OpenScene>()
let store: SceneStore | undefined
let persistenceRequested = false

function requestPersistentStorage() {
  if (persistenceRequested) return
  persistenceRequested = true
  // Without this, the browser may evict the database under storage pressure (DESIGN.md §11).
  navigator.storage?.persist?.().catch(() => undefined)
}

/** Saves the word count, and the change since the last save to today's stats. */
async function saveWordCount(sceneId: string, scene: OpenScene) {
  clearTimeout(scene.wordsTimer)
  scene.wordsTimer = undefined
  const words = countWords(proseText(scene.provider.doc))
  await recordWordCount(db, sceneId, words, deviceId(), localDay())
}

async function saveAutoVersion(sceneId: string, scene: OpenScene) {
  clearTimeout(scene.versionTimer)
  scene.versionTimer = undefined
  await saveVersion(db, sceneId, scene.provider.doc, { kind: "auto" })
}

async function saveBaseline(sceneId: string, state: Uint8Array) {
  const doc = docFromState(state)
  try {
    await saveVersion(db, sceneId, doc, { kind: "auto" })
  } finally {
    doc.destroy()
  }
}

const logError = (what: string) => (error: unknown) => console.error(`[scene-doc] ${what}`, error)

function onLocalEdit(sceneId: string, scene: OpenScene) {
  requestPersistentStorage()
  clearTimeout(scene.wordsTimer)
  scene.wordsTimer = setTimeout(() => {
    saveWordCount(sceneId, scene).catch(logError("word count"))
  }, WORD_COUNT_DELAY_MS)

  if (scene.baseline) {
    const baseline = scene.baseline
    scene.baseline = null
    saveBaseline(sceneId, baseline).catch(logError("version"))
  } else {
    scene.baseline = null
  }
  scene.versionTimer ??= setTimeout(() => {
    saveAutoVersion(sceneId, scene).catch(logError("version"))
  }, VERSION_EVERY_MS)
}

/** Opens (or reuses) the live doc for a scene. Pair every call with `releaseSceneDoc`. */
export function acquireSceneDoc(sceneId: string): SceneDocProvider {
  const existing = open.get(sceneId)
  if (existing) {
    clearTimeout(existing.releaseTimer)
    existing.refs++
    return existing.provider
  }
  store ??= createPowerSyncSceneStore(db)
  const scene = { refs: 1 } as OpenScene
  scene.provider = new SceneDocProvider(store, sceneId, { onLocalUpdate: () => onLocalEdit(sceneId, scene) })
  void scene.provider.loaded.then(() => {
    // Unless something was already edited before the load finished.
    if (scene.baseline === undefined) scene.baseline = Y.encodeStateAsUpdateV2(scene.provider.doc)
  })
  open.set(sceneId, scene)
  return scene.provider
}

export function releaseSceneDoc(sceneId: string) {
  const scene = open.get(sceneId)
  if (!scene || --scene.refs > 0) return
  clearTimeout(scene.releaseTimer)
  scene.releaseTimer = setTimeout(() => {
    open.delete(sceneId)
    void (async () => {
      // Leaving a scene after editing it saves a version (DESIGN.md §8).
      if (scene.versionTimer !== undefined) await saveAutoVersion(sceneId, scene).catch(logError("version"))
      if (scene.wordsTimer !== undefined) await saveWordCount(sceneId, scene)
      await scene.provider.destroy()
    })().catch(logError("close"))
  }, RELEASE_DELAY_MS)
}

/**
 * Runs `work` on a scene's live doc, which it opens for the purpose when no editor has it open, and resolves once
 * the edits it made are written.
 */
export async function withSceneDoc<T>(sceneId: string, work: (provider: SceneDocProvider) => Promise<T> | T): Promise<T> {
  const provider = acquireSceneDoc(sceneId)
  try {
    await provider.loaded
    const result = await work(provider)
    await provider.flush()
    return result
  } finally {
    releaseSceneDoc(sceneId)
  }
}

/** The live doc of a scene that is open now, if it is. */
export const openSceneDoc = (sceneId: string): SceneDocProvider | undefined => open.get(sceneId)?.provider

/** Live providers, for the dev hooks the end-to-end tests use. */
export function openSceneDocs(): SceneDocProvider[] {
  return [...open.values()].map((scene) => scene.provider)
}

/** Saves pending word counts and versions now rather than after their delays, e.g. before a test reads them. */
export async function settleSceneDocs() {
  await Promise.all(
    [...open].map(async ([sceneId, scene]) => {
      if (scene.wordsTimer !== undefined) await saveWordCount(sceneId, scene)
      if (scene.versionTimer !== undefined) await saveAutoVersion(sceneId, scene)
    }),
  )
}

// Best effort when the tab goes away: edits are already written as they happen; counts and versions may be pending.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const [sceneId, scene] of open) {
      if (scene.wordsTimer !== undefined) saveWordCount(sceneId, scene).catch(() => undefined)
      if (scene.versionTimer !== undefined) saveAutoVersion(sceneId, scene).catch(() => undefined)
    }
  })
}
