import { usePowerSync } from "@powersync/react"
import { useEffect, useState } from "react"
import type { Db } from "@/db/tx"
import type { MentionMatcher } from "@/editor/mentions"
import { onSceneEdit, openSceneDoc } from "@/editor/sceneDocs"
import { storedSceneReader } from "@/export/scenes"
import { proseText } from "@/yjs/prose"
import { docFromState } from "@/yjs/versions"
import { countMentionsIn } from "./codexPanelData"

/** Quiet time after typing in one of the chapter's scenes before its names are counted again. */
const RECOUNT_DELAY_MS = 1000

export interface ChapterMentions {
  /** By entry id; null until the chapter has been counted. */
  counts: ReadonlyMap<string, number> | null
  /** The prose couldn't be read. */
  failed: boolean
}

/** The scenes' plain text: live for the ones open here, so the last keystroke counts; as stored for the rest. */
async function sceneTexts(db: Db, sceneIds: readonly string[]): Promise<string[]> {
  const readStored = storedSceneReader(db)
  return Promise.all(
    sceneIds.map(async (sceneId) => {
      const live = openSceneDoc(sceneId)
      if (live) {
        await live.loaded
        return proseText(live.doc)
      }
      const doc = docFromState(await readStored(sceneId))
      try {
        return proseText(doc)
      } finally {
        doc.destroy()
      }
    }),
  )
}

/**
 * Mentions by entry in a chapter's prose, as the editor underlines them. Counted when the chapter, its scenes or the
 * names change, and again once typing in one of its scenes pauses.
 */
export function useChapterMentions(
  chapterId: string,
  sceneIds: readonly string[],
  matcher: MentionMatcher,
): ChapterMentions {
  const db = usePowerSync()
  const [counted, setCounted] = useState<{ chapterId: string; counts: ReadonlyMap<string, number> } | null>(null)
  const [failedChapter, setFailedChapter] = useState<string | null>(null)
  const [edits, setEdits] = useState(0)
  // Scene ids are UUIDs: no commas.
  const scenesKey = sceneIds.join(",")

  useEffect(() => {
    const scenes = new Set(scenesKey.split(","))
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = onSceneEdit((sceneId) => {
      if (!scenes.has(sceneId)) return
      clearTimeout(timer)
      timer = setTimeout(() => setEdits((count) => count + 1), RECOUNT_DELAY_MS)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [scenesKey])

  useEffect(() => {
    let cancelled = false
    sceneTexts(db, scenesKey ? scenesKey.split(",") : [])
      .then((texts) => {
        if (cancelled) return
        setCounted({ chapterId, counts: countMentionsIn(texts, matcher) })
        setFailedChapter(null)
      })
      .catch((error: unknown) => {
        console.error("[codex] Couldn't count the chapter's mentions", error)
        if (!cancelled) setFailedChapter(chapterId)
      })
    return () => {
      cancelled = true
    }
  }, [db, chapterId, scenesKey, matcher, edits])

  return {
    counts: counted?.chapterId === chapterId ? counted.counts : null,
    failed: failedChapter === chapterId,
  }
}
