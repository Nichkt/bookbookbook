import type { Editor } from "@tiptap/react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { ChapterDrawer } from "@/features/plan/ChapterDrawer"
import { ChapterDetailsContext, type ChapterDetailsValue } from "@/features/plan/planContext"
import { chapterTitle } from "@/features/plan/status"
import { useBookStructures } from "@/features/plan/useStructures"
import { byData, focusPending, focusSoon } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { CodexPanel } from "./CodexPanel"
import { CODEX_PANEL_HEADING } from "./codexPanelData"
import { useWrite, type PanelPage } from "./writeContext"

/** The toolbar controls that open the panel, which focus goes back to when it closes. */
const OPENER = "[data-write-panel-return]"
/** The toolbar's button for a page, or on phones the menu that holds them. */
const openerOf = (page: PanelPage) => `[data-write-panel-return="${page}"], [data-write-panel-return="menu"]`

const LABELS: Record<PanelPage, string> = { plan: "Chapter details", codex: "World" }

const headingOf = (page: PanelPage, chapterId: string) =>
  page === "plan" ? byData("drawer-heading", chapterId) : CODEX_PANEL_HEADING

/** Puts focus back where the panel was opened from: the scene a name was in, or the toolbar. */
function returnFocus(page: PanelPage, opener: Editor | null, soon: boolean) {
  if (opener && !opener.isDestroyed) opener.commands.focus(null, { scrollIntoView: false })
  else if (soon) focusSoon(openerOf(page))
  else document.querySelector<HTMLElement>(openerOf(page))?.focus()
}

/**
 * The panel beside the text (DESIGN.md §8): the chapter's plan, as the Plan's chapter details show it, or its World page.
 * Docked on wide screens, where it stays open across visits; a sheet over the text elsewhere.
 */
export function WritePanel() {
  const { db, bookId, book, plan, focusItem, chapterId, panelDocked, panel, setPanel } = useWrite()
  const structures = useBookStructures(book.template_key)
  const details = useMemo<ChapterDetailsValue>(
    () => ({ db, bookId, plan, structures, focusItem, place: "write" }),
    [db, bookId, plan, structures, focusItem],
  )
  const chapter = plan.chapterById.get(chapterId)
  const close = () => setPanel(null)
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
    if (document.activeElement?.closest(OPENER)) focusSoon(headingOf(page, chapterId))
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
      {page === "plan" ? <ChapterDrawer chapterId={chapterId} onClose={close} /> : <CodexPanel onClose={close} />}
    </aside>
  )
}

interface PanelSheetProps {
  /** Null while the sheet is closed. */
  page: PanelPage | null
  chapterId: string | null
  onClose: () => void
}

function PanelSheet({ page, chapterId, onClose }: PanelSheetProps) {
  const { plan, panelOpener } = useWrite()
  // Keeps showing the page while the sheet slides away.
  const [shown, setShown] = useState({ page, chapterId })
  if (page && chapterId && (page !== shown.page || chapterId !== shown.chapterId)) setShown({ page, chapterId })
  const chapter = shown.chapterId ? plan.chapterById.get(shown.chapterId) : undefined
  const codex = shown.page === "codex"
  let title = "Chapter details"
  if (codex) title = "World"
  else if (chapter) title = `Chapter ${chapter.number}: ${chapterTitle(chapter.title)}`

  return (
    <DialogPrimitive.Root open={page !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          tabIndex={-1}
          data-write-panel-scroller
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-surface shadow-xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right md:w-[440px] md:border-l"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (shown.page && shown.chapterId) focusSoon(headingOf(shown.page, shown.chapterId))
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!focusPending() && shown.page) returnFocus(shown.page, panelOpener(), false)
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {codex
              ? "The people, places and things this chapter names, and a search through the rest of your world."
              : "The chapter's plan. Changes save as you type."}
          </DialogPrimitive.Description>
          {shown.chapterId &&
            (codex ? (
              <CodexPanel onClose={onClose} />
            ) : (
              <ChapterDrawer chapterId={shown.chapterId} onClose={onClose} />
            ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
