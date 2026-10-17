import { useEffect, useState } from "react"
import { countWords } from "@/lib/words"
import type { SceneDocProvider } from "@/yjs/SceneDocProvider"
import { proseText } from "@/yjs/prose"
import { acquireSceneDoc, releaseSceneDoc } from "./sceneDocs"

/** The scene's live doc once everything stored for it has loaded; null until then, and while `sceneId` is null. */
export function useSceneDoc(sceneId: string | null): SceneDocProvider | null {
  const [loaded, setLoaded] = useState<SceneDocProvider | null>(null)
  useEffect(() => {
    if (!sceneId) return
    let active = true
    const provider = acquireSceneDoc(sceneId)
    void provider.loaded.then(() => {
      if (active) setLoaded(provider)
    })
    return () => {
      active = false
      releaseSceneDoc(sceneId)
    }
  }, [sceneId])
  return sceneId && loaded?.sceneId === sceneId ? loaded : null
}

/** Something read from a scene doc, read again shortly after each change from any source. `read` must be stable. */
function useDocReading<T>(provider: SceneDocProvider | null, read: (provider: SceneDocProvider) => T): T | null {
  const [reading, setReading] = useState<{ provider: SceneDocProvider; value: T } | null>(null)
  useEffect(() => {
    if (!provider) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => setReading({ provider, value: read(provider) })
    const onUpdate = () => {
      clearTimeout(timer)
      timer = setTimeout(update, 250)
    }
    update()
    provider.doc.on("update", onUpdate)
    return () => {
      clearTimeout(timer)
      provider.doc.off("update", onUpdate)
    }
  }, [provider, read])
  return provider && reading?.provider === provider ? reading.value : null
}

const readWords = (provider: SceneDocProvider) => countWords(proseText(provider.doc))
const readText = (provider: SceneDocProvider) => proseText(provider.doc)

/** Live word count of a scene doc. */
export const useSceneWords = (provider: SceneDocProvider | null): number | null => useDocReading(provider, readWords)

/** Live plain text of a scene doc. */
export const useSceneText = (provider: SceneDocProvider | null): string | null => useDocReading(provider, readText)
