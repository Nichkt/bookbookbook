import { usePowerSync } from "@powersync/react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Navigate, useLocation, useParams } from "react-router"
import { rememberBook, useCurrentBook } from "@/app/books"
import { announce, attempt } from "@/app/feedback"
import { PlaceholderScreen } from "@/app/PlaceholderScreens"
import { setPref, usePref } from "@/db/prefs"
import type { BookListRow } from "@/db/queries"
import { byData, focusPending, focusSoon } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { Board } from "./Board"
import { ChapterDrawer } from "./ChapterDrawer"
import { isPlanView, useDisplay, viewPrefKey, type PlanView } from "./display"
import { useChapterDrawer } from "./drawerNav"
import { activeFilterCount, matchesFilters, usePlanFilters } from "./filters"
import { Outline } from "./Outline"
import { itemSelector, PlanContext, usePlanContext, type DrawerFocus, type PlanContextValue } from "./planContext"
import type { PlanChapter } from "./planData"
import { usePlan } from "./planData"
import { PlanToolbar } from "./PlanToolbar"
import { chapterTitle } from "./status"

/** From here up the drawer sits beside the view instead of over it (DESIGN.md §6). */
const DOCKED_QUERY = "(min-width: 64rem)"

/** `/b/:bookId/plan`: the view used last for this book, else the Board. */
export function PlanIndex() {
  const { bookId = "" } = useParams()
  const location = useLocation()
  const { value, isLoading } = usePref(viewPrefKey(bookId))
  if (isLoading) return null
  const view: PlanView = isPlanView(value) ? value : "board"
  return (
    <Navigate replace to={{ pathname: `/b/${bookId}/plan/${view}`, search: location.search }} state={location.state} />
  )
}

/** `/b/:bookId/plan/:view`. */
export function PlanScreen() {
  const { bookId = "", view } = useParams()
  const location = useLocation()
  if (!isPlanView(view)) return <Navigate replace to={{ pathname: `/b/${bookId}/plan`, search: location.search }} />
  return <PlanWorkspace key={bookId} bookId={bookId} view={view} />
}

function PlanWorkspace({ bookId, view }: { bookId: string; view: PlanView }) {
  const { book, isLoading: booksLoading } = useCurrentBook()
  if (booksLoading) return null
  if (!book) {
    return (
      <PlaceholderScreen title="Book not found" milestone="Plan">
        <p>It may have been deleted. Pick another book from the book menu above, or restore it from the Trash there.</p>
      </PlaceholderScreen>
    )
  }
  return <PlanLoaded book={book} bookId={bookId} view={view} />
}

function PlanLoaded({ book, bookId, view }: { book: BookListRow; bookId: string; view: PlanView }) {
  const db = usePowerSync()
  const { plan, isLoading } = usePlan(bookId)
  const { display, setPreset, toggleField } = useDisplay(bookId, view)
  const { filters, setFilter, clearFilters } = usePlanFilters()
  const { chapterId, openChapter, closeChapter } = useChapterDrawer()
  const docked = useMediaQuery(DOCKED_QUERY)

  useEffect(() => {
    rememberBook(bookId)
    void attempt("remember view", setPref(db, viewPrefKey(bookId), view))
  }, [db, bookId, view])

  const matches = useCallback((chapter: PlanChapter) => matchesFilters(chapter, filters), [filters])
  const filtering = activeFilterCount(filters) > 0
  const matchCount = useMemo(() => plan.chapters.filter(matches).length, [plan.chapters, matches])

  // Dimming is silent, so say what a filter change did.
  const filterKey = [filters.pov, filters.status, filters.thread].join("|")
  const announcedKey = useRef(filterKey)
  useEffect(() => {
    if (isLoading || announcedKey.current === filterKey) return
    announcedKey.current = filterKey
    announce(filtering ? `${matchCount} of ${plan.chapters.length} chapters match` : "Filters cleared")
  }, [isLoading, filterKey, filtering, matchCount, plan.chapters.length])

  const focusItem = useCallback(
    (kind: "act" | "chapter" | "scene", id: string) => {
      const selector = itemSelector(view, kind, id)
      if (selector) focusSoon(selector)
    },
    [view],
  )

  const showChapter = useCallback(
    (id: string, focus: DrawerFocus = "heading") => {
      openChapter(id)
      if (focus !== "none") focusSoon(byData(focus === "title" ? "drawer-title" : "drawer-heading", id))
    },
    [openChapter],
  )

  const context = useMemo<PlanContextValue>(
    () => ({
      db,
      bookId,
      book,
      plan,
      view,
      display,
      setPreset,
      toggleField,
      filters,
      setFilter,
      clearFilters,
      matches,
      filtering,
      matchCount,
      openId: chapterId,
      showChapter,
      focusItem,
    }),
    [
      db,
      bookId,
      book,
      plan,
      view,
      display,
      setPreset,
      toggleField,
      filters,
      setFilter,
      clearFilters,
      matches,
      filtering,
      matchCount,
      chapterId,
      showChapter,
      focusItem,
    ],
  )

  if (isLoading) return null

  return (
    <PlanContext.Provider value={context}>
      <div className="flex flex-1 flex-col">
        <PlanToolbar />
        <div className="flex flex-1 items-start">
          <div data-plan-main tabIndex={-1} className="min-w-0 flex-1 self-stretch outline-none">
            <h1 className="sr-only">
              Plan: {view === "board" ? "Board" : "Outline"}
            </h1>
            {view === "board" ? <Board /> : <Outline />}
          </div>
          {docked && chapterId && <DockedDrawer chapterId={chapterId} onClose={closeChapter} />}
        </div>
        {!docked && <DrawerSheet chapterId={chapterId} onClose={closeChapter} />}
      </div>
    </PlanContext.Provider>
  )
}

/** Puts focus back on the chapter's card or row once its drawer closes, unless something else took it. */
function useReturnFocus() {
  const { plan, focusItem } = usePlanContext()
  return useCallback(
    (chapterId: string | null, container: HTMLElement | null) => {
      if (focusPending()) return
      const active = document.activeElement
      const lost = !active || active === document.body || !!container?.contains(active)
      if (!lost) return
      if (chapterId && plan.chapterById.has(chapterId)) focusItem("chapter", chapterId)
      else focusSoon("[data-plan-main]")
    },
    [plan, focusItem],
  )
}

/** The drawer beside the view on wide screens. Not modal: the board stays usable. */
function DockedDrawer({ chapterId, onClose }: { chapterId: string; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const returnFocus = useReturnFocus()
  const close = () => {
    returnFocus(chapterId, ref.current)
    onClose()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.nativeEvent.defaultPrevented || isComposing(event.nativeEvent)) return
    event.preventDefault()
    close()
  }
  return (
    <aside
      ref={ref}
      aria-label="Chapter details"
      onKeyDown={onKeyDown}
      className="sticky top-[6.5rem] h-[calc(100svh-6.5rem)] w-[400px] shrink-0 overflow-y-auto border-l bg-surface pointer-coarse:top-28 pointer-coarse:h-[calc(100svh-7rem)]"
    >
      <ChapterDrawer chapterId={chapterId} onClose={close} />
    </aside>
  )
}

/** The drawer as a sheet over the view on narrower screens. */
function DrawerSheet({ chapterId, onClose }: { chapterId: string | null; onClose: () => void }) {
  const { plan } = usePlanContext()
  const contentRef = useRef<HTMLDivElement>(null)
  const returnFocus = useReturnFocus()
  // Keeps showing the chapter while the sheet slides away.
  const [shownId, setShownId] = useState(chapterId)
  if (chapterId && chapterId !== shownId) setShownId(chapterId)
  const chapter = shownId ? plan.chapterById.get(shownId) : undefined

  return (
    <DialogPrimitive.Root open={!!chapterId} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-surface shadow-xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right md:w-[440px] md:border-l"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (!focusPending()) contentRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus(shownId, contentRef.current)
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {chapter ? `Chapter ${chapter.number}: ${chapterTitle(chapter.title)}` : "Chapter details"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            The chapter's plan. Changes save as you type.
          </DialogPrimitive.Description>
          {shownId && <ChapterDrawer chapterId={shownId} onClose={onClose} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
