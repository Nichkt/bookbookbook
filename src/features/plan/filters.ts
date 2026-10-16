import { useCallback, useMemo } from "react"
import { useLocation, useNavigate } from "react-router"
import type { ChapterStatus } from "@/db/schema"
import type { PlanChapter } from "./planData"
import { isStatus } from "./status"

/*
 * Filters live in the URL (`?pov=…&status=…&thread=…`), so a filtered board can be bookmarked and Back doesn't
 * step through every change. Chapters that don't match are dimmed rather than hidden: the structure stays readable
 * and drag targets stay put.
 */

export interface PlanFilters {
  pov: string | null
  status: ChapterStatus | null
  thread: string | null
}

export type FilterKey = keyof PlanFilters

export function readFilters(params: URLSearchParams): PlanFilters {
  const status = params.get("status")
  return {
    pov: params.get("pov") || null,
    status: isStatus(status) ? status : null,
    thread: params.get("thread") || null,
  }
}

export const activeFilterCount = (filters: PlanFilters) =>
  [filters.pov, filters.status, filters.thread].filter(Boolean).length

export function matchesFilters(chapter: PlanChapter, filters: PlanFilters) {
  if (filters.pov && chapter.pov_entry_id !== filters.pov) return false
  if (filters.status && (isStatus(chapter.status) ? chapter.status : "idea") !== filters.status) return false
  if (filters.thread && !chapter.threads.includes(filters.thread)) return false
  return true
}

export const searchString = (params: URLSearchParams) => {
  const text = params.toString()
  return text ? `?${text}` : ""
}

export function usePlanFilters() {
  const location = useLocation()
  const navigate = useNavigate()
  const filters = useMemo(() => readFilters(new URLSearchParams(location.search)), [location.search])

  const update = useCallback(
    (change: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(location.search)
      change(params)
      navigate(
        { pathname: location.pathname, search: searchString(params) },
        { replace: true, state: location.state as unknown },
      )
    },
    [location, navigate],
  )
  const setFilter = useCallback(
    (key: FilterKey, value: string | null) =>
      update((params) => {
        if (value) params.set(key, value)
        else params.delete(key)
      }),
    [update],
  )
  const clearFilters = useCallback(
    () =>
      update((params) => {
        for (const key of ["pov", "status", "thread"]) params.delete(key)
      }),
    [update],
  )
  return { filters, setFilter, clearFilters }
}
