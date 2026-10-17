import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { ChapterDrawer } from "@/features/plan/ChapterDrawer"
import { ChapterDetailsContext, type ChapterDetailsValue } from "@/features/plan/planContext"
import { chapterTitle } from "@/features/plan/status"
import { byData, focusPending, focusSoon } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { useWrite } from "./writeContext"

/** The control that opened the panel, which focus goes back to when it closes. */
const RETURN = "[data-write-panel-return]"

/**
 * The chapter's plan beside the text (DESIGN.md §8): the Plan's chapter details for the chapter in the URL. Docked
 * on wide screens, where it stays open across visits; a sheet over the text elsewhere.
 */
export function PlanPanel() {
  const { db, bookId, plan, focusItem, chapterId, panelDocked, panelOpen, setPanelOpen } = useWrite()
  const details = useMemo<ChapterDetailsValue>(
    () => ({ db, bookId, plan, focusItem, place: "write" }),
    [db, bookId, plan, focusItem],
  )
  const chapter = plan.chapterById.get(chapterId)
  const close = () => setPanelOpen(false)
  return (
    <ChapterDetailsContext.Provider value={details}>
      {panelDocked ? (
        panelOpen && chapter && <DockedPanel chapterId={chapter.id} onClose={close} />
      ) : (
        <PanelSheet chapterId={chapter?.id ?? null} open={panelOpen && !!chapter} onClose={close} />
      )}
    </ChapterDetailsContext.Provider>
  )
}

function DockedPanel({ chapterId, onClose }: { chapterId: string; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null)

  // Opened from the toolbar: start in it. Open since the last visit: leave focus be.
  useEffect(() => {
    if (document.activeElement?.closest(RETURN)) focusSoon(byData("drawer-heading", chapterId))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- on opening only

  const close = () => {
    const inside = !!ref.current?.contains(document.activeElement)
    onClose()
    if (inside) focusSoon(RETURN)
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

function PanelSheet({ chapterId, open, onClose }: { chapterId: string | null; open: boolean; onClose: () => void }) {
  const { plan } = useWrite()
  // Keeps showing the chapter while the sheet slides away.
  const [shownId, setShownId] = useState(chapterId)
  if (open && chapterId && chapterId !== shownId) setShownId(chapterId)
  const chapter = shownId ? plan.chapterById.get(shownId) : undefined

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          tabIndex={-1}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-surface shadow-xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right md:w-[440px] md:border-l"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (shownId) focusSoon(byData("drawer-heading", shownId))
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!focusPending()) document.querySelector<HTMLElement>(RETURN)?.focus()
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
