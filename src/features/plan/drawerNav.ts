import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router"
import { searchString } from "./filters"

/*
 * The chapter drawer is part of the URL (`?chapter=<id>`), so a link can open it and Back closes it. Opening pushes
 * one history entry; switching chapters while it's open replaces it, so Back never walks through every chapter
 * looked at.
 */

interface DrawerState {
  drawer: true
  /** Where the drawer was opened from, to tell whether Back would land there. */
  from: string
}

const withoutChapter = (search: string) => {
  const params = new URLSearchParams(search)
  params.delete("chapter")
  return searchString(params)
}

export function useChapterDrawer() {
  const location = useLocation()
  const navigate = useNavigate()
  const chapterId = new URLSearchParams(location.search).get("chapter")

  const openChapter = useCallback(
    (id: string) => {
      const params = new URLSearchParams(location.search)
      const wasOpen = params.has("chapter")
      params.set("chapter", id)
      const to = { pathname: location.pathname, search: searchString(params) }
      if (wasOpen) {
        navigate(to, { replace: true, state: location.state as unknown })
      } else {
        const state: DrawerState = { drawer: true, from: location.pathname + withoutChapter(location.search) }
        navigate(to, { state })
      }
    },
    [location, navigate],
  )

  const closeChapter = useCallback(() => {
    const base = location.pathname + withoutChapter(location.search)
    const state = location.state as Partial<DrawerState> | null
    if (state?.from === base) navigate(-1)
    else navigate(base, { replace: true })
  }, [location, navigate])

  return { chapterId, openChapter, closeChapter }
}
