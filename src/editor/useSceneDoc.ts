import { useEffect, useState } from "react"
import { countWords } from "@/lib/words"
import type { SceneDocProvider } from "@/yjs/SceneDocProvider"
import { proseText } from "@/yjs/prose"
import { acquireSceneDoc, releaseSceneDoc } from "./sceneDocs"

/** The scene's live doc once everything stored for it has loaded; null until then. */
export function useSceneDoc(sceneId: string): SceneDocProvider | null {
  const [loaded, setLoaded] = useState<SceneDocProvider | null>(null)
  useEffect(() => {
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
  return loaded?.sceneId === sceneId ? loaded : null
}

/** Live word count of a scene doc, recounted shortly after each change from any source. */
export function useSceneWords(provider: SceneDocProvider | null): number | null {
  const [words, setWords] = useState<number | null>(null)
  useEffect(() => {
    if (!provider) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const count = () => setWords(countWords(proseText(provider.doc)))
    const onUpdate = () => {
      clearTimeout(timer)
      timer = setTimeout(count, 250)
    }
    count()
    provider.doc.on("update", onUpdate)
    return () => {
      clearTimeout(timer)
      provider.doc.off("update", onUpdate)
    }
  }, [provider])
  return provider ? words : null
}
