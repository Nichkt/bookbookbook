import { usePowerSync } from "@powersync/react"
import type { Editor } from "@tiptap/react"
import { LayoutGridIcon, PenLineIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { rememberBook, useCurrentBook } from "@/app/books"
import { attempt } from "@/app/feedback"
import { PlaceholderScreen } from "@/app/PlaceholderScreens"
import { Button, buttonVariants } from "@/components/ui/button"
import { usePref } from "@/db/prefs"
import type { BookListRow } from "@/db/queries"
import { activeEditor } from "@/editor/activeEditor"
import { useMentionMatcher } from "@/editor/useMentionMatcher"
import { createChapter } from "@/features/plan/mutations"
import type { FocusItem } from "@/features/plan/planContext"
import { usePlan, type Plan } from "@/features/plan/planData"
import { byData, focusSoon } from "@/lib/focus"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { ChapterUnit, SceneUnit } from "./ChapterPage"
import { isSnapshotShortcut, useHistoryDialog } from "./history"
import { takeSnapshot } from "./historyActions"
import { HistoryDialog } from "./HistoryDialog"
import { Manuscript } from "./Manuscript"
import { MentionLayer } from "./MentionLayer"
import { Navigator } from "./Navigator"
import {
  chapterOfScene,
  isWriteUnit,
  NAV_PREF,
  PANEL_DOCKED_QUERY,
  PANEL_PREF,
  panelFromPref,
  sceneNameIn,
  unitPrefKey,
  useWrite,
  WriteContext,
  writePath,
  type PanelPage,
  type WriteContextValue,
  type WriteUnit,
} from "./writeContext"
import { WritePanel } from "./WritePanel"
import { WriteToolbar } from "./WriteToolbar"

const lastChapterKey = (bookId: string) => `bbb.lastChapter.${bookId}`

function readLastChapter(bookId: string) {
  try {
    return localStorage.getItem(lastChapterKey(bookId))
  } catch {
    return null
  }
}

function saveLastChapter(bookId: string, chapterId: string) {
  try {
    localStorage.setItem(lastChapterKey(bookId), chapterId)
  } catch {
    // Only a convenience.
  }
}

/** `/b/:bookId/write/:chapterId?/:sceneId?`: the Write screen (DESIGN.md §8). */
export function WriteScreen() {
  const { bookId = "" } = useParams()
  return <WriteBook key={bookId} bookId={bookId} />
}

function WriteBook({ bookId }: { bookId: string }) {
  const { chapterId, sceneId } = useParams()
  const { book, isLoading: booksLoading } = useCurrentBook()
  const { plan, isLoading } = usePlan(bookId)
  const prefs = useWritePrefs(bookId)

  if (booksLoading || isLoading || prefs.isLoading) return null
  if (!book) {
    return (
      <PlaceholderScreen title="Book not found" milestone="Write">
        <p>It may have been deleted. Pick another book from the book menu above, or restore it from the Trash there.</p>
      </PlaceholderScreen>
    )
  }
  if (plan.chapters.length === 0) {
    return <EmptyBook bookId={bookId} firstActId={plan.groups.find((group) => group.act)?.act?.id ?? null} />
  }
  if (!chapterId) {
    const last = readLastChapter(bookId)
    const target = (last && plan.chapterById.get(last)) || plan.chapters[0]
    return <Navigate to={writePath(bookId, target.id)} replace />
  }
  return <WriteWorkspace book={book} plan={plan} chapterId={chapterId} sceneId={sceneId ?? null} prefs={prefs} />
}

/** A pref that changes on screen at once, ahead of its write to the database. */
function usePrefState(key: string) {
  const { value, isLoading, setValue } = usePref(key)
  const [pending, setPending] = useState<string | null>(null)
  if (pending !== null && value === pending) setPending(null)
  const set = useCallback(
    (next: string) => {
      setPending(next)
      void setValue(next)
    },
    [setValue],
  )
  return { value: pending ?? value, isLoading, set }
}

type WritePrefs = ReturnType<typeof useWritePrefs>

/** The view per book; whether the navigator is open and the docked panel's page, per device. */
function useWritePrefs(bookId: string) {
  const unit = usePrefState(unitPrefKey(bookId))
  const nav = usePrefState(NAV_PREF)
  const panel = usePrefState(PANEL_PREF)
  const { set: setNav } = nav
  const { set: setPanel } = panel
  return {
    isLoading: unit.isLoading || nav.isLoading || panel.isLoading,
    unit: isWriteUnit(unit.value) ? unit.value : ("chapter" as WriteUnit),
    saveUnit: unit.set,
    navOpen: nav.value !== "closed",
    saveNavOpen: useCallback((open: boolean) => setNav(open ? "open" : "closed"), [setNav]),
    dockedPanel: panelFromPref(panel.value),
    saveDockedPanel: useCallback((page: PanelPage | null) => setPanel(page ?? "closed"), [setPanel]),
  }
}

interface WorkspaceProps {
  book: BookListRow
  plan: Plan
  chapterId: string
  sceneId: string | null
  prefs: WritePrefs
}

function WriteWorkspace({ book, plan, chapterId, sceneId, prefs }: WorkspaceProps) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const bookId = book.id
  const matcher = useMentionMatcher(bookId)
  const panelDocked = useMediaQuery(PANEL_DOCKED_QUERY)
  const [sheetPanel, setSheetPanel] = useState<PanelPage | null>(null)
  const [codexEntryId, setCodexEntryId] = useState<string | null>(null)
  const opener = useRef<Editor | null>(null)
  const { unit, saveUnit, navOpen, saveNavOpen, dockedPanel, saveDockedPanel } = prefs
  const known = plan.chapterById.has(chapterId)

  useEffect(() => {
    rememberBook(bookId, "write")
    if (known) saveLastChapter(bookId, chapterId)
  }, [bookId, chapterId, known])

  // What the callbacks below read when they run, so they can stay the same functions.
  const latest = useRef({ plan, chapterId, sceneId, unit })
  useLayoutEffect(() => {
    latest.current = { plan, chapterId, sceneId, unit }
  })

  const focusItem = useCallback<FocusItem>(
    (kind, id) => {
      const current = latest.current
      if (kind === "act") return
      if (kind === "chapter") {
        if (id !== current.chapterId) navigate(writePath(bookId, id))
        focusSoon(byData("write-heading", id))
        return
      }
      const target = chapterOfScene(current.plan, id)?.id ?? current.chapterId
      if (current.unit === "scene") navigate(writePath(bookId, target, id))
      else if (target !== current.chapterId) navigate(writePath(bookId, target))
      focusSoon(`${byData("write-scene-title", id)}, ${byData("scene-id", id)} [contenteditable="true"]`)
    },
    [bookId, navigate],
  )

  // The new view opens at the scene the writer was in, or was reading.
  const setUnit = useCallback(
    (next: WriteUnit) => {
      const current = latest.current
      saveUnit(next)
      const active = activeEditor()?.sceneId
      const chapter = current.plan.chapterById.get(current.chapterId)
      const scene = active && chapter?.scenes.some(({ id }) => id === active) ? active : current.sceneId
      navigate(writePath(bookId, current.chapterId, scene), { replace: true })
    },
    [bookId, navigate, saveUnit],
  )

  const toggleNav = useCallback(() => saveNavOpen(!navOpen), [navOpen, saveNavOpen])
  const panel = panelDocked ? dockedPanel : sheetPanel
  const showPanel = useCallback(
    (page: PanelPage | null) => (panelDocked ? saveDockedPanel(page) : setSheetPanel(page)),
    [panelDocked, saveDockedPanel],
  )
  const setPanel = useCallback(
    (page: PanelPage | null) => {
      if (page) opener.current = null
      if (page === "codex") setCodexEntryId(null)
      showPanel(page)
    },
    [showPanel],
  )
  const openEntryFromText = useCallback(
    (entryId: string) => {
      opener.current = activeEditor()?.editor ?? null
      setCodexEntryId(entryId)
      showPanel("codex")
    },
    [showPanel],
  )
  const panelOpener = useCallback(() => opener.current, [])

  // Ctrl+Alt+S: a snapshot of the scene in the History dialog, else of the one the writer is in.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isSnapshotShortcut(event)) return
      const dialog = useHistoryDialog.getState()
      const sceneId = dialog.sceneId ?? activeEditor()?.sceneId
      if (!sceneId) return
      event.preventDefault()
      const name = dialog.sceneId ? dialog.sceneName : sceneNameIn(latest.current.plan, sceneId)
      void takeSnapshot(db, sceneId, name)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [db])

  const context = useMemo<WriteContextValue>(
    () => ({
      db,
      bookId,
      book,
      plan,
      matcher,
      unit,
      setUnit,
      chapterId,
      sceneId,
      focusItem,
      navOpen,
      toggleNav,
      panelDocked,
      panel,
      setPanel,
      codexEntryId,
      setCodexEntryId,
      openEntryFromText,
      panelOpener,
    }),
    [
      db,
      bookId,
      book,
      plan,
      matcher,
      unit,
      setUnit,
      chapterId,
      sceneId,
      focusItem,
      navOpen,
      toggleNav,
      panelDocked,
      panel,
      setPanel,
      codexEntryId,
      openEntryFromText,
      panelOpener,
    ],
  )

  return (
    <WriteContext.Provider value={context}>
      <div className="flex flex-1 flex-col">
        <WriteToolbar />
        <div className="flex flex-1 items-start">
          {navOpen && <Navigator />}
          <MentionLayer className="min-w-0 flex-1 self-stretch">
            <WriteContent />
          </MentionLayer>
          <WritePanel />
        </div>
        <HistoryDialog />
      </div>
    </WriteContext.Provider>
  )
}

function WriteContent() {
  const { plan, unit, chapterId } = useWrite()
  if (unit === "manuscript") return <Manuscript />
  const chapter = plan.chapterById.get(chapterId)
  if (!chapter) return <MissingChapter />
  return unit === "scene" ? <SceneUnit key={chapter.id} chapter={chapter} /> : <ChapterUnit key={chapter.id} chapter={chapter} />
}

function MissingChapter() {
  const { bookId, plan } = useWrite()
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-heading text-2xl font-semibold text-ink">Chapter not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        That chapter isn't in this book. It may be in the Trash.
      </p>
      <Link
        to={writePath(bookId, plan.chapters[0].id)}
        className={cn("mt-4 inline-flex items-center text-sm text-ink underline underline-offset-2 pointer-coarse:min-h-11")}
      >
        Go to chapter 1
      </Link>
    </div>
  )
}

/** A book whose chapters are all gone: new books start with one, so they were moved to the Trash. */
function EmptyBook({ bookId, firstActId }: { bookId: string; firstActId: string | null }) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const start = async () => {
    if (busy) return
    setBusy(true)
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: firstActId }))
    setBusy(false)
    if (!id) return
    navigate(`/b/${bookId}/write/${id}`)
    focusSoon(`${byData("write-chapter", id)} [contenteditable="true"]`)
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="font-heading text-2xl font-semibold text-ink">No chapters yet</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Start writing, or lay the book out in the planner first. Chapters moved to the Trash can be restored from the
        book menu.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => void start()} disabled={busy}>
          <PenLineIcon />
          Write chapter 1
        </Button>
        <Link to={`/b/${bookId}/plan`} className={buttonVariants({ variant: "outline" })}>
          <LayoutGridIcon />
          Open the planner
        </Link>
      </div>
    </div>
  )
}
