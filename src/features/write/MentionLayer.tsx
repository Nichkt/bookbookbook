import { Popover as PopoverPrimitive } from "radix-ui"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { Link, useNavigate } from "react-router"
import { Button, buttonVariants } from "@/components/ui/button"
import { Portrait, TypeIcon } from "@/features/codex/CodexIcons"
import { codexPath, useCodex, type Codex, type CodexEntry } from "@/features/codex/codexData"
import { IS_MAC } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { filledFields } from "./codexPanelData"
import { useWrite } from "./writeContext"

/** How long the pointer rests on a name before its card opens. */
const OPEN_DELAY_MS = 350
/** How long an open card waits for the pointer to come back to it, or to its name. */
const CLOSE_DELAY_MS = 200
/** Typing moves names under a resting pointer, which shouldn't open cards. */
const TYPING_QUIET_MS = 500
const FIELDS_SHOWN = 3
const MENTION = ".mention-auto[data-entry-id]"
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "Fn", "FnLock"])
const MOD_CLICK = IS_MAC ? "⌘-click" : "Ctrl+click"

interface Measurable {
  getBoundingClientRect(): DOMRect
}

interface Card {
  entryId: string
  anchor: Measurable
}

const mentionAt = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>(MENTION) : null

const isModClick = (event: MouseEvent) => event.button === 0 && (IS_MAC ? event.metaKey : event.ctrlKey)

/** Where a card points: the line of the name under the pointer, as a name can wrap; where it was if it's gone. */
function anchorAt(span: HTMLElement, x: number, y: number): Measurable {
  const lines = () => [...span.getClientRects()]
  const index = Math.max(
    0,
    lines().findIndex((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom),
  )
  let last = lines()[index] ?? span.getBoundingClientRect()
  return {
    getBoundingClientRect() {
      if (span.isConnected) last = lines()[index] ?? last
      return last
    },
  }
}

/**
 * The writing area, where resting the mouse on a name the text underlines opens a card about its entry (DESIGN.md §7),
 * and Ctrl+click (⌘-click on a Mac) on one opens the entry in the Codex. A plain click places the caret, as anywhere in
 * the text: keyboard and touch reach the same entries through the panel's Codex page.
 */
export function MentionLayer({ className, children }: { className?: string; children: ReactNode }) {
  const { bookId, openEntryFromText } = useWrite()
  const codex = useCodex(bookId)
  const navigate = useNavigate()
  const [card, setCard] = useState<Card | null>(null)
  const [open, setOpen] = useState(false)
  // Mirrors of the state for the event handlers, which can run before a render catches up.
  const shownId = useRef<string | null>(null)
  const pendingId = useRef<string | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastKeyAt = useRef(-Infinity)

  const hide = useCallback(() => {
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
    pendingId.current = null
    if (shownId.current === null) return
    shownId.current = null
    setOpen(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(event.key)) return
      lastKeyAt.current = performance.now()
      hide()
    }
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("scroll", hide, { capture: true, passive: true })
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("scroll", hide, true)
      hide()
    }
  }, [hide])

  const scheduleClose = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(hide, CLOSE_DELAY_MS)
  }

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    const span = mentionAt(event.target)
    const entryId = span?.dataset.entryId
    if (!span || !entryId) return
    if (shownId.current === entryId) {
      clearTimeout(closeTimer.current)
      return
    }
    if (pendingId.current === entryId) return
    if (event.buttons !== 0 || performance.now() - lastKeyAt.current < TYPING_QUIET_MS) return
    const { clientX, clientY } = event
    const show = () => {
      pendingId.current = null
      clearTimeout(closeTimer.current)
      if (!span.isConnected) return hide()
      shownId.current = entryId
      setCard({ entryId, anchor: anchorAt(span, clientX, clientY) })
      setOpen(true)
    }
    clearTimeout(openTimer.current)
    if (shownId.current !== null) {
      // From one name to the next while a card is open: no second wait.
      show()
    } else {
      pendingId.current = entryId
      openTimer.current = setTimeout(show, OPEN_DELAY_MS)
    }
  }

  const onPointerOut = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    const span = mentionAt(event.target)
    // Moving within a name, or between the pieces marks split it into, isn't leaving it.
    if (!span || mentionAt(event.relatedTarget)?.dataset.entryId === span.dataset.entryId) return
    clearTimeout(openTimer.current)
    pendingId.current = null
    if (shownId.current !== null) scheduleClose()
  }

  const onMouseDownCapture = (event: MouseEvent) => {
    if (!isModClick(event) || !mentionAt(event.target)) return
    // Keeps the caret where it is: ProseMirror would select the paragraph.
    event.preventDefault()
    event.stopPropagation()
  }

  const onClickCapture = (event: MouseEvent) => {
    const entryId = isModClick(event) ? mentionAt(event.target)?.dataset.entryId : undefined
    if (!entryId) return
    event.preventDefault()
    event.stopPropagation()
    hide()
    navigate(codexPath(bookId, entryId))
  }

  const entry = card ? codex.entryById.get(card.entryId) : undefined
  const virtualRef = useMemo(() => ({ current: card?.anchor ?? null }), [card])

  return (
    <>
      <div
        className={className}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onMouseDownCapture={onMouseDownCapture}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
      <PopoverPrimitive.Root open={open && !!entry} onOpenChange={(next) => !next && hide()}>
        <PopoverPrimitive.Anchor virtualRef={virtualRef} />
        <PopoverPrimitive.Portal>
          {entry && (
            <MentionCard
              bookId={bookId}
              codex={codex}
              entry={entry}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") clearTimeout(closeTimer.current)
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse" && shownId.current !== null) scheduleClose()
              }}
              onDetails={() => {
                hide()
                openEntryFromText(entry.id)
              }}
            />
          )}
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  )
}

interface MentionCardProps {
  bookId: string
  codex: Codex
  entry: CodexEntry
  onPointerEnter: (event: PointerEvent) => void
  onPointerLeave: (event: PointerEvent) => void
  onDetails: () => void
}

function MentionCard({ bookId, codex, entry, onPointerEnter, onPointerLeave, onDetails }: MentionCardProps) {
  const nameId = useId()
  const type = entry.typeId ? codex.typeById.get(entry.typeId) : undefined
  const fields = filledFields(entry, type).slice(0, FIELDS_SHOWN)
  const notes = entry.notes.trim()
  let details: ReactNode
  if (fields.length > 0) {
    details = (
      <dl className="grid gap-1.5">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="line-clamp-2 text-ink-2">{value}</dd>
          </div>
        ))}
      </dl>
    )
  } else if (notes) {
    details = <p className="line-clamp-3 whitespace-pre-line text-ink-2">{notes}</p>
  } else {
    details = <p className="text-muted-foreground">No details yet.</p>
  }

  return (
    <PopoverPrimitive.Content
      side="bottom"
      align="start"
      sideOffset={6}
      collisionPadding={12}
      aria-labelledby={nameId}
      // The caret stays in the text: the card is for reading.
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="z-50 grid w-80 gap-3 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    >
      <div className="flex items-center gap-2.5">
        <Portrait entry={entry} className="size-9 text-xs" />
        <div className="min-w-0">
          <p id={nameId} className={cn("truncate font-semibold text-ink", !entry.named && "text-muted-foreground italic")}>
            {entry.name}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TypeIcon icon={type?.icon ?? null} className="size-3.5 shrink-0" />
            {type?.singular ?? "No type"}
          </p>
        </div>
      </div>
      {details}
      <div className="flex items-center justify-end gap-1">
        <Link
          to={codexPath(bookId, entry.id)}
          title={`Or ${MOD_CLICK} the name`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-ink-2")}
        >
          Open in Codex
        </Link>
        <Button variant="secondary" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={onDetails}>
          Details
        </Button>
      </div>
    </PopoverPrimitive.Content>
  )
}
