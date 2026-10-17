import { usePowerSync, useQuery } from "@powersync/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { flushSceneDocs } from "@/editor/sceneDocs"
import { useMentionMatcherState } from "@/editor/useMentionMatcher"
import { storedSceneReader } from "@/export/scenes"
import {
  APPEARANCE_ACTS_SQL,
  APPEARANCE_CHAPTERS_SQL,
  buildAppearances,
  countMentions,
  PLAN_LINKS_SQL,
  type Appearance,
  type AppearanceActRow,
  type AppearanceChapterRow,
  type MentionCounts,
  type PlanLinkRow,
} from "./appearances"

/** Quiet time after a name or alias changes before the prose is counted again. */
const RECOUNT_DELAY_MS = 600

const NO_COUNTS: MentionCounts = new Map()

export interface Appearances {
  /** By entry id, in reading order. */
  byEntry: ReadonlyMap<string, Appearance[]>
  /** False until the prose has been counted: until then only the plan's links are in. */
  counted: boolean
  /** The prose couldn't be counted, so only the plan's links are in. */
  failed: boolean
}

/**
 * Where every entry of the book appears. The plan's links are live; the prose is counted when the screen opens and
 * again when names or aliases change, since nobody writes while it's open.
 */
export function useAppearances(bookId: string): Appearances {
  const db = usePowerSync()
  const { matcher, isLoading } = useMentionMatcherState(bookId)
  const acts = useQuery<AppearanceActRow>(APPEARANCE_ACTS_SQL, [bookId])
  const chapters = useQuery<AppearanceChapterRow>(APPEARANCE_CHAPTERS_SQL, [bookId])
  const links = useQuery<PlanLinkRow>(PLAN_LINKS_SQL, [bookId, bookId, bookId, bookId])
  const [counts, setCounts] = useState<{ bookId: string; counts: MentionCounts } | null>(null)
  const [failedBook, setFailedBook] = useState<string | null>(null)
  const countedBook = useRef<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    let cancelled = false
    const recount = countedBook.current === bookId
    const timer = setTimeout(
      () => {
        flushSceneDocs()
          .then(() => countMentions(db, bookId, matcher, storedSceneReader(db)))
          .then((result) => {
            if (cancelled) return
            countedBook.current = bookId
            setCounts({ bookId, counts: result })
            setFailedBook(null)
          })
          .catch((error: unknown) => {
            console.error("[codex] Couldn't count mentions", error)
            if (!cancelled) setFailedBook(bookId)
          })
      },
      recount ? RECOUNT_DELAY_MS : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [db, bookId, matcher, isLoading])

  const current = counts?.bookId === bookId ? counts.counts : null
  const byEntry = useMemo(
    () => buildAppearances(acts.data, chapters.data, links.data, current ?? NO_COUNTS),
    [acts.data, chapters.data, links.data, current],
  )
  return { byEntry, counted: current !== null, failed: failedBook === bookId }
}
