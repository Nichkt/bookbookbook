import { usePowerSync } from "@powersync/react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useLocation, useParams } from "react-router"
import { toast } from "sonner"
import { rememberBook, useCurrentBook } from "@/app/books"
import { announce, attempt } from "@/app/feedback"
import { PlaceholderScreen } from "@/app/PlaceholderScreens"
import { setPref, usePref } from "@/db/prefs"
import type { BookListRow } from "@/db/queries"
import { byData, focusPending, focusSoon } from "@/lib/focus"
import { Board } from "./Board"
import { ChapterDrawer, type ChapterStep, type NewChapterActions } from "./ChapterDrawer"
import { chapterName, leaveOutNewChapter } from "./commands"
import { isPlanView, useDisplay, VIEW_LABELS, viewPrefKey, type PlanView } from "./display"
import { useChapterDrawer } from "./drawerNav"
import { activeFilterCount, matchesFilters, usePlanFilters } from "./filters"
import { Matrix } from "./Matrix"
import { Outline } from "./Outline"
import { itemSelector, PlanContext, usePlanContext, type DrawerFocus, type PlanContextValue } from "./planContext"
import type { PlanChapter } from "./planData"
import { usePlan } from "./planData"
import { PlanDialogHost } from "./PlanDialogHost"
import { PlanToolbar } from "./PlanToolbar"
import { chapterTitle } from "./status"
import { Timeline } from "./Timeline"
import { useBookStructures, useRibbonShown } from "./useStructures"

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
  const structures = useBookStructures(book.template_key)
  const ribbon = useRibbonShown(bookId)
  const { display, setPreset, toggleField } = useDisplay(bookId, view)
  const { filters, setFilter, clearFilters } = usePlanFilters()
  const { chapterId, openChapter, closeChapter } = useChapterDrawer()

  useEffect(() => {
    rememberBook(bookId, "plan")
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

  const stepChapter = useCallback<ChapterStep>(
    (id, direction) => {
      openChapter(id)
      focusSoon(byData("chapter-nav", direction))
    },
    [openChapter],
  )

  const { newId, showNewChapter, newChapterActions, settleNewChapter } = useNewChapter({
    plan,
    showChapter,
    closeChapter,
    focusItem,
  })

  const context = useMemo<PlanContextValue>(
    () => ({
      db,
      bookId,
      book,
      plan,
      structures,
      ribbonShown: ribbon.shown,
      setRibbonShown: ribbon.setShown,
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
      showNewChapter,
      focusItem,
    }),
    [
      db,
      bookId,
      book,
      plan,
      structures,
      ribbon.shown,
      ribbon.setShown,
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
      showNewChapter,
      focusItem,
    ],
  )

  // Everything that changes the layout loads first, so nothing shifts once the plan shows.
  if (isLoading || structures.isLoading || ribbon.isLoading) return null

  return (
    <PlanContext.Provider value={context}>
      <div className="flex flex-1 flex-col">
        <PlanToolbar />
        <div className="flex flex-1 items-start">
          <div data-plan-main tabIndex={-1} className="min-w-0 flex-1 self-stretch outline-none">
            <h1 className="sr-only">Plan: {VIEW_LABELS[view]}</h1>
            {view === "board" && <Board cards="chapter" />}
            {view === "corkboard" && <Board cards="index" />}
            {view === "outline" && <Outline />}
            {view === "matrix" && <Matrix />}
            {view === "timeline" && <Timeline />}
          </div>
        </div>
        <ChapterPopout
          chapterId={chapterId}
          newId={newId}
          newChapterActions={newChapterActions}
          onClose={closeChapter}
          onStep={stepChapter}
          onClosed={settleNewChapter}
        />
        <PlanDialogHost />
      </div>
    </PlanContext.Provider>
  )
}

interface PendingChapter {
  id: string
  /** What added it, for focus to go back to if it's left out. */
  opener: HTMLElement | null
  /** Saved, or opened to write: it stays in the plan. */
  kept: boolean
}

/**
 * A chapter added through the pop-out (DESIGN.md §6) waits there to be filled in. Save keeps it and goes back to the
 * plan; Write this chapter keeps it too. Going back any other way (Back to planning, Close, Escape, the browser's
 * Back) leaves it out of the plan.
 */
function useNewChapter({
  plan,
  showChapter,
  closeChapter,
  focusItem,
}: {
  plan: PlanContextValue["plan"]
  showChapter: PlanContextValue["showChapter"]
  closeChapter: () => void
  focusItem: PlanContextValue["focusItem"]
}) {
  const db = usePowerSync()
  const [newId, setNewId] = useState<string | null>(null)
  const pending = useRef<PendingChapter | null>(null)
  // The pop-out also closes when the Plan goes away, as for Write this chapter. That never leaves a chapter out.
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const showNewChapter = useCallback(
    (id: string, opener: HTMLElement | null = null) => {
      pending.current = { id, opener, kept: false }
      setNewId(id)
      showChapter(id, "title")
    },
    [showChapter],
  )

  const newChapterActions = useMemo<NewChapterActions>(
    () => ({
      save: (title) => {
        const entry = pending.current
        if (!entry) return
        entry.kept = true
        const number = plan.chapterById.get(entry.id)?.number ?? plan.chapters.length
        toast(`Saved ${chapterName({ title, number })}`)
        closeChapter()
      },
      keep: () => {
        if (pending.current) pending.current.kept = true
      },
    }),
    [plan, closeChapter],
  )

  /**
   * Runs once the pop-out has closed on `id`, after its fields have saved what was typed. Returns whether it moved
   * focus.
   */
  const settleNewChapter = useCallback(
    (id: string | null) => {
      const entry = pending.current
      if (!entry || entry.id !== id) return false
      pending.current = null
      setNewId(null)
      if (entry.kept || !alive.current) return false
      if (entry.opener?.isConnected) entry.opener.focus()
      else focusSoon("[data-plan-main]")
      void leaveOutNewChapter(db, plan, entry.id, focusItem)
      return true
    },
    [db, plan, focusItem],
  )

  return { newId, showNewChapter, newChapterActions, settleNewChapter }
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

/**
 * A chapter's details popped out over the Plan (DESIGN.md §6): centered on wider screens, the whole screen on a phone.
 * Previous and next step through the chapters without closing it.
 */
function ChapterPopout({
  chapterId,
  newId,
  newChapterActions,
  onClose,
  onStep,
  onClosed,
}: {
  chapterId: string | null
  /** A chapter just added, not yet saved. */
  newId: string | null
  newChapterActions: NewChapterActions
  onClose: () => void
  onStep: ChapterStep
  /** Runs once it has closed on a chapter. Returns whether that moved focus. */
  onClosed: (chapterId: string | null) => boolean
}) {
  const { plan } = usePlanContext()
  const contentRef = useRef<HTMLDivElement>(null)
  const returnFocus = useReturnFocus()
  // Keeps showing the chapter while the pop-out fades away.
  const [shownId, setShownId] = useState(chapterId)
  if (chapterId && chapterId !== shownId) setShownId(chapterId)
  const chapter = shownId ? plan.chapterById.get(shownId) : undefined
  const isNew = !!shownId && shownId === newId

  return (
    <DialogPrimitive.Root open={!!chapterId} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 duration-150 supports-backdrop-filter:backdrop-blur-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          data-chapter-popout=""
          className="fixed inset-0 z-50 flex scroll-pt-16 scroll-pb-32 flex-col overflow-y-auto sm:scroll-pb-20 overscroll-contain bg-surface shadow-2xl outline-none duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(54rem,calc(100dvh-4rem))] sm:w-[calc(100%-3rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:ring-1 sm:ring-foreground/10"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (focusPending()) return
            // Opened from the URL, as after a reload: start at the top, as a click on a card does.
            const content = contentRef.current
            const heading = content?.querySelector<HTMLElement>("[data-drawer-heading]") ?? content
            heading?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            // By now the fields have saved what was typed, so a new chapter left out is judged on all of it.
            if (onClosed(shownId)) return
            returnFocus(shownId, contentRef.current)
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {chapter ? `Chapter ${chapter.number}: ${chapterTitle(chapter.title)}` : "Chapter details"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {isNew
              ? "A new chapter. Save to add it to the plan, or go back to planning to leave it out."
              : "The chapter's plan. Changes save as you type."}
          </DialogPrimitive.Description>
          {shownId && (
            <ChapterDrawer
              chapterId={shownId}
              onClose={onClose}
              onStep={onStep}
              newChapter={isNew ? newChapterActions : undefined}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}