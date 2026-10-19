import type { Editor } from "@tiptap/react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { ChapterDrawer } from "@/features/plan/ChapterDrawer"
import { ChapterDetailsContext, type ChapterDetailsValue } from "@/features/plan/planContext"
import { chapterTitle } from "@/features/plan/status"
import { useBookStructures } from "@/features/plan/useStructures"
import { focusPending, focusSoon } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { AiPanel } from "./ai/AiPanel"
import { CodexPanel } from "./CodexPanel"
import { matchToReturnTo } from "./findActions"
import { FindPanel } from "./FindPanel"
import { panelHeading } from "./writeActions"
import { useWrite, useWritePlace, type PanelPage } from "./writeContext"

/** The toolbar controls that open the panel, which focus goes back to when it closes. */
const OPENER = "[data-write-panel-return]"
/** The toolbar's button for a page, or on phones the menu that holds them. */
const openerOf = (page: PanelPage) => `[data-write-panel-return="${page}"], [data-write-panel-return="menu"]`

const LABELS: Record<PanelPage, string> = {
  plan: "Chapter details",
  codex: "World",
  find: "Find and replace",
  ai: "AI tools",
}

/** Puts focus back where the panel was opened from: the scene a name was in, or the toolbar. */
function returnFocus(page: PanelPage, opener: Editor | null, soon: boolean) {
  if (opener && !opener.isDestroyed) opener.commands.focus(null, { scrollIntoView: false })
  else if (soon) focusSoon(openerOf(page))
  else document.querySelector<HTMLElement>(openerOf(page))?.focus()
}

/**
 * The panel beside the text (DESIGN.md §8): the chapter's plan, as the Plan's chapter details show it, its World page,
 * or Find and replace. Docked on wide screens, where it stays open across visits; a sheet over the text elsewhere,
 * rising from the bottom on phones.
 */
export function WritePanel() {
  const { db, bookId, book, plan, focusItem, panelDocked, panel, setPanel, setPanelOpener } = useWrite()
  const { chapterId } = useWritePlace()
  const structures = useBookStructures(book.template_key)
  const details = useMemo<ChapterDetailsValue>(
    () => ({ db, bookId, plan, structures, focusItem, place: "write" }),
    [db, bookId, plan, structures, focusItem],
  )
  const chapter = plan.chapterById.get(chapterId)
  const close = () => {
    // Having gone to a match from Find and replace, focus goes to the match.
    const match = panel === "find" ? matchToReturnTo() : null
    if (match) setPanelOpener(match)
    setPanel(null)
  }
  return (
    <ChapterDetailsContext.Provider value={details}>
      {panelDocked ? (
        panel && chapter && <DockedPanel key={panel} page={panel} chapterId={chapter.id} onClose={close} />
      ) : (
        <PanelSheet page={chapter ? panel : null} chapterId={chapter?.id ?? null} onClose={close} />
      )}
    </ChapterDetailsContext.Provider>
  )
}

function DockedPanel({ page, chapterId, onClose }: { page: PanelPage; chapterId: string; onClose: () => void }) {
  const { panelOpener } = useWrite()
  const ref = useRef<HTMLElement>(null)

  // Opened from the toolbar: start in it. Open since the last visit, or from a name in the text: leave focus be.
  useEffect(() => {
    if (document.activeElement?.closest(OPENER)) focusSoon(panelHeading(page, chapterId))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- on opening only

  const close = () => {
    const inside = !!ref.current?.contains(document.activeElement)
    onClose()
    if (inside) returnFocus(page, panelOpener(), true)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.nativeEvent.defaultPrevented || isComposing(event.nativeEvent)) return
    event.preventDefault()
    close()
  }

  return (
    <aside
      ref={ref}
      aria-label={LABELS[page]}
      onKeyDown={onKeyDown}
      data-write-panel-scroller
      className="sticky top-[6.5rem] h-[calc(100svh-6.5rem)] w-[400px] shrink-0 overflow-y-auto border-l bg-surface pointer-coarse:top-28 pointer-coarse:h-[calc(100svh-7rem)]"
    >
      <PageBody page={page} chapterId={chapterId} onClose={close} />
    </aside>
  )
}

function PageBody({ page, chapterId, onClose }: { page: PanelPage; chapterId: string; onClose: () => void }) {
  if (page === "plan") return <ChapterDrawer chapterId={chapterId} onClose={onClose} />
  if (page === "ai") return <AiPanel onClose={onClose} />
  return page === "codex" ? <CodexPanel onClose={onClose} /> : <FindPanel onClose={onClose} />
}

const SHEET_DESCRIPTIONS: Record<PanelPage, string> = {
  plan: "The chapter's plan. Changes save as you type.",
  codex: "The people, places and things this chapter names, and a search through the rest of your world.",
  find: "Search the whole book's text, and replace what you find.",
  ai: "Tools that write, rewrite and brainstorm with you when you ask, and what they came up with.",
}

interface PanelSheetProps {
  /** Null while the sheet is closed. */
  page: PanelPage | null
  chapterId: string | null
  onClose: () => void
}

function PanelSheet({ page, chapterId, onClose }: PanelSheetProps) {
  const { plan, panelOpener } = useWrite()
  const sheet = useRef<HTMLDivElement>(null)
  // Keeps showing the page while the sheet slides away.
  const [shown, setShown] = useState({ page, chapterId })
  if (page && chapterId && (page !== shown.page || chapterId !== shown.chapterId)) setShown({ page, chapterId })
  const chapter = shown.chapterId ? plan.chapterById.get(shown.chapterId) : undefined
  let title = LABELS[shown.page ?? "plan"]
  if (shown.page === "plan" && chapter) title = `Chapter ${chapter.number}: ${chapterTitle(chapter.title)}`

  // On phones it rises from the bottom (DESIGN.md §16), leaving the top of the page in sight to tap away to.
  return (
    <DialogPrimitive.Root open={page !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={sheet}
          tabIndex={-1}
          className={cn(
            "fixed inset-x-0 top-14 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t bg-surface shadow-xl outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in",
            "max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:slide-in-from-bottom",
            "md:inset-y-0 md:left-auto md:w-[440px] md:rounded-none md:border-t-0 md:border-l md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right",
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (shown.page && shown.chapterId) focusSoon(panelHeading(shown.page, shown.chapterId))
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!focusPending() && shown.page) returnFocus(shown.page, panelOpener(), false)
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {SHEET_DESCRIPTIONS[shown.page ?? "plan"]}
          </DialogPrimitive.Description>
          <SheetGrabber sheet={sheet} onClose={onClose} />
          <div data-write-panel-scroller className="min-h-0 flex-1 overflow-y-auto">
            {shown.page && shown.chapterId && (
              <PageBody page={shown.page} chapterId={shown.chapterId} onClose={onClose} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Dragged down past a quarter of the sheet's height, or flicked down, the sheet closes. */
const CLOSE_FRACTION = 1 / 4
/** A flick: in pixels a millisecond, how far it must go at that speed, and how lately it must still have moved. */
const FLICK_SPEED = 0.5
const FLICK_DISTANCE = 24
const FLICK_WITHIN_MS = 100

interface Drag {
  pointerId: number
  startY: number
  lastY: number
  lastTime: number
  /** Downward, in pixels a millisecond, as of the last move. */
  speed: number
}

/**
 * The bottom sheet's handle, on phones: the sheet follows it down, and closes if let go far enough down or with a
 * flick, else springs back. Esc, the page's own close button and tapping above the sheet close it too.
 */
function SheetGrabber({ sheet, onClose }: { sheet: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const drag = useRef<Drag | null>(null)
  const ours = (event: { pointerId: number }) => drag.current?.pointerId === event.pointerId

  return (
    <div
      aria-hidden="true"
      data-sheet-grabber=""
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || !sheet.current) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const { pointerId, clientY, timeStamp } = event
        drag.current = { pointerId, startY: clientY, lastY: clientY, lastTime: timeStamp, speed: 0 }
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || !ours(event) || !sheet.current) return
        const elapsed = event.timeStamp - current.lastTime
        if (elapsed > 0) current.speed = (event.clientY - current.lastY) / elapsed
        current.lastY = event.clientY
        current.lastTime = event.timeStamp
        holdSheet(sheet.current, Math.max(0, event.clientY - current.startY))
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (!current || !ours(event)) return
        drag.current = null
        const element = sheet.current
        if (!element) return
        const distance = event.clientY - current.startY
        const moving = event.timeStamp - current.lastTime < FLICK_WITHIN_MS
        const flicked = distance > FLICK_DISTANCE && moving && current.speed > FLICK_SPEED
        // Closing slides it the rest of the way down from where it was let go.
        if (distance > element.offsetHeight * CLOSE_FRACTION || flicked) onClose()
        else springBack(element)
      }}
      onPointerCancel={(event) => {
        if (!ours(event)) return
        drag.current = null
        if (sheet.current) springBack(sheet.current)
      }}
      className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden"
    >
      <div className="h-1 w-10 rounded-full bg-ink-2/30" />
    </div>
  )
}

/** Holds the sheet `offset` pixels below where it sits open, as it follows the pointer. */
function holdSheet(element: HTMLElement, offset: number) {
  element.style.transition = "none"
  element.style.transform = `translateY(${offset}px)`
}

/** Lets the sheet spring back up to where it sits open. */
function springBack(element: HTMLElement) {
  element.style.transition = "transform 200ms ease-out"
  element.style.transform = ""
  element.addEventListener("transitionend", () => (element.style.transition = ""), { once: true })
}
