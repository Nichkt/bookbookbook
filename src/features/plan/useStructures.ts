import { useQuery } from "@powersync/react"
import { useCallback, useMemo } from "react"
import { usePref } from "@/db/prefs"
import { findStructure, momentName, structureFromRow, type MomentName, type StoryStructure } from "./structures"

/** The writer's own structures: `templates` rows of kind "overlay", shared by all their books. */
export const STRUCTURES_SQL = "SELECT id, name, beats FROM templates WHERE kind = 'overlay' ORDER BY name COLLATE NOCASE, id"

export interface StructureRow {
  id: string
  name: string | null
  beats: string | null
}

export interface BookStructures {
  /** The structure the book follows, if any. */
  current: StoryStructure | null
  /** The writer's own, by name. */
  custom: StoryStructure[]
  /** A chapter's `template_beat_key` as people read it. */
  momentName: (key: string) => MomentName
  /** Until the writer's own structures have loaded, the book can't be following one of them. */
  isLoading: boolean
}

function useCustomStructureQuery(): { custom: StoryStructure[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<StructureRow>(STRUCTURES_SQL)
  const custom = useMemo(() => data.flatMap((row) => structureFromRow(row) ?? []), [data])
  return { custom, isLoading }
}

export function useCustomStructures(): StoryStructure[] {
  return useCustomStructureQuery().custom
}

export function useBookStructures(templateKey: string | null | undefined): BookStructures {
  const { custom, isLoading } = useCustomStructureQuery()
  return useMemo(() => {
    const current = findStructure(templateKey, custom)
    return { current, custom, isLoading, momentName: (key: string) => momentName(key, current, custom) }
  }, [templateKey, custom, isLoading])
}

/**
 * Whether the Board and Corkboard show the structure ribbon. On until the writer hides it, per book. The Plan loads
 * this with the plan itself, so the ribbon doesn't appear late and push the cards down.
 */
export function useRibbonShown(bookId: string): {
  shown: boolean
  isLoading: boolean
  setShown: (shown: boolean) => void
} {
  const { value, isLoading, setValue } = usePref(`plan.ribbon:${bookId}`)
  const setShown = useCallback((shown: boolean) => void setValue(shown ? "shown" : "hidden"), [setValue])
  return {
    // Not until the setting has loaded, so a hidden ribbon doesn't flash up.
    shown: !isLoading && value !== "hidden",
    isLoading,
    setShown,
  }
}
