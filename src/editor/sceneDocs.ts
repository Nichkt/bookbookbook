import { db } from "@/db/powersync"
import { createPowerSyncSceneStore } from "@/db/powersyncSceneStore"
import { countWords } from "@/lib/words"
import { SceneDocProvider } from "@/yjs/SceneDocProvider"
import { proseText } from "@/yjs/prose"
import type { SceneStore } from "@/yjs/sceneStore"

/** A released doc lingers this long, so StrictMode remounts and quick back-and-forth navigation reuse it. */
const RELEASE_DELAY_MS = 1500
/** Word counts are a projection of the prose (DESIGN.md §5), saved once typing pauses. */
const WORD_COUNT_DELAY_MS = 1000

interface OpenScene {
  provider: SceneDocProvider
  refs: number
  releaseTimer?: ReturnType<typeof setTimeout>
  wordsTimer?: ReturnType<typeof setTimeout>
  /** `scenes.word_count` as last read or written; undefined until read. */
  savedWords?: number
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

async function saveWordCount(sceneId: string, scene: OpenScene) {
  clearTimeout(scene.wordsTimer)
  scene.wordsTimer = undefined
  const words = countWords(proseText(scene.provider.doc))
  if (words === scene.savedWords) return
  scene.savedWords = words
  await db.execute("UPDATE scenes SET word_count = ? WHERE id = ?", [words, sceneId])
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
  scene.provider = new SceneDocProvider(store, sceneId, {
    onLocalUpdate() {
      requestPersistentStorage()
      clearTimeout(scene.wordsTimer)
      scene.wordsTimer = setTimeout(() => {
        saveWordCount(sceneId, scene).catch((error) => console.error("[scene-doc] word count", error))
      }, WORD_COUNT_DELAY_MS)
    },
  })
  db.getOptional<{ word_count: number | null }>("SELECT word_count FROM scenes WHERE id = ?", [sceneId]).then(
    (row) => (scene.savedWords ??= row?.word_count ?? 0),
    () => undefined,
  )
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
      if (scene.wordsTimer !== undefined) await saveWordCount(sceneId, scene)
      await scene.provider.destroy()
    })().catch((error) => console.error("[scene-doc] close", error))
  }, RELEASE_DELAY_MS)
}

/** Live providers, for the dev hooks the end-to-end tests use. */
export function openSceneDocs(): SceneDocProvider[] {
  return [...open.values()].map((scene) => scene.provider)
}

// Best effort when the tab goes away: edits are already written as they happen, word counts may be pending.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const [sceneId, scene] of open) {
      if (scene.wordsTimer !== undefined) saveWordCount(sceneId, scene).catch(() => undefined)
    }
  })
}
