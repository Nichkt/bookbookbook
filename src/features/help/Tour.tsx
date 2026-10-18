import { BookAIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import { useLocation } from "react-router"
import { Button } from "@/components/ui/button"
import { focusPending } from "@/lib/focus"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { termById } from "./glossary"
import { endTour, openGlossary, useHelp, type TourId } from "./helpStore"
import { placeCard, revealBy, spotlightBox, type Band, type Box, type CardPlacement, type Size } from "./tourLayout"
import { textOf, TOURS, tourForPath, type TourContext } from "./tours"

/** Below this, the Write toolbar folds most of its tools into its ⋯ menu, which some steps mention. */
const WIDE_QUERY = "(min-width: 48rem)"
const CARD = "[data-tour-card]"
const POPOUT = "[data-chapter-popout]"
/** The Plan's chapters, which are there once it has loaded. */
const PLAN_LOADED = "[data-plan-main]"
/** How long to wait for the page to show what a step needs before skipping the step. */
const PATIENCE_MS = 3000
const DIM = "rgb(0 0 0 / 0.45)"
/** Where the card waits for its first measurement: off screen, but still focusable. */
const UNPLACED: CSSProperties = { left: -9999, top: 0 }

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
/** Ends a sentence that doesn't already end with a stop, a question mark or the like. */
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`)

/** Waits a frame at a time until `check` passes. False if it never does, or `cancelled` says to stop. */
async function waitUntil(check: () => unknown, cancelled: () => boolean) {
  const started = performance.now()
  while (!check()) {
    if (cancelled() || performance.now() - started > PATIENCE_MS) return false
    await nextFrame()
  }
  return !cancelled()
}

const isShowing = (element: Element) =>
  typeof element.checkVisibility === "function" ? element.checkVisibility() : element.getClientRects().length > 0

/** The first element matching `selector` that's showing: phones and wider screens often have one each. */
function firstShowing(selector: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) if (isShowing(element)) return element
  return null
}

/** What a step points at: the first showing element whose `data-tour` includes `name`. */
const findTarget = (name: string) => firstShowing(`[data-tour~="${name}"]`)

const STICKY_BARS = "[data-sticky-top], [data-sticky-bottom]"
/** Room kept between a target scrolled into view and the bars. */
const REVEAL_GAP = 8

const viewportSize = () => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight })

/** The part of the screen the page's sticky bars leave clear for `target`. A dialog sits over them. */
function clearBand(target: Element, viewport: Size): Band {
  const band = { top: 0, bottom: viewport.height }
  if (target.closest('[role="dialog"]')) return band
  for (const bar of document.querySelectorAll<HTMLElement>(STICKY_BARS)) {
    if (bar.contains(target) || !isShowing(bar)) continue
    const rect = bar.getBoundingClientRect()
    if (bar.hasAttribute("data-sticky-top")) band.top = Math.max(band.top, rect.bottom)
    else band.bottom = Math.min(band.bottom, rect.top)
  }
  return band
}

/** Scrolls a step's target into the clear part of the screen, if it isn't there already. */
function reveal(target: HTMLElement) {
  const viewport = viewportSize()
  const clear = clearBand(target, viewport)
  const block = revealBy(target.getBoundingClientRect(), clear, viewport)
  if (block === "none") return
  const { scrollMarginTop, scrollMarginBottom } = target.style
  // A bar's own buttons can only scroll sideways.
  if (!target.closest(STICKY_BARS)) {
    target.style.scrollMarginTop = `${clear.top + REVEAL_GAP}px`
    target.style.scrollMarginBottom = `${viewport.height - clear.bottom + REVEAL_GAP}px`
  }
  target.scrollIntoView({ block, inline: "nearest" })
  target.style.scrollMarginTop = scrollMarginTop
  target.style.scrollMarginBottom = scrollMarginBottom
}

/** The page tour that's running, if any (DESIGN.md §17a). */
export function Tour() {
  const tour = useHelp((state) => state.tour)
  return tour ? <TourRun key={tour} tour={tour} /> : null
}

interface Runner {
  /** A move between steps is under way. */
  busy: boolean
  ending: boolean
  /** The tour has gone. */
  cancelled: boolean
  /** The tour opened a chapter's pop-out for the steps about it, so it closes it again. */
  staged: boolean
  /** The card is closing only while the page changes for the next step, so focus stays put. */
  quiet: boolean
  /** The last move was back, so the card focuses Back when it reopens. */
  wentBack: boolean
}

interface Layout {
  spot: Box | null
  place: CardPlacement | null
}

/**
 * A card that walks through the page a step at a time, lighting up what each step is about. It's a modal dialog:
 * Back and Next (or ← and →) move, Escape or the X ends it, and focus goes back to where the tour was started.
 * For steps about a chapter's details, it opens the first chapter's pop-out, and closes it after.
 */
function TourRun({ tour }: { tour: TourId }) {
  const { title, steps } = TOURS[tour]
  const { pathname } = useLocation()
  const narrow = !useMediaQuery(WIDE_QUERY)
  const coarse = useMediaQuery("(pointer: coarse)")
  const context: TourContext = { narrow, coarse, pathname }
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState(true)
  const [announcement, setAnnouncement] = useState("")
  const cardRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const run = useRef<Runner>({ busy: false, ending: false, cancelled: false, staged: false, quiet: false, wentBack: false })

  const step = steps[index]
  const layout = useTourLayout(shown ? step.target : undefined, cardRef, shown)
  const term = step.term ? termById.get(step.term) : undefined
  const last = index === steps.length - 1

  useEffect(() => {
    const state = run.current
    state.cancelled = false
    return () => {
      state.cancelled = true
    }
  }, [])

  // A tour is about one page, so leaving the page ends it.
  useEffect(() => {
    if (tourForPath(pathname) !== tour) endTour()
  }, [pathname, tour])

  const waitFor = (check: () => unknown) => waitUntil(check, () => run.current.cancelled)

  // The card closes while the page changes under it, so it can open again on top of a pop-out.
  const hideCard = async () => {
    run.current.quiet = true
    setShown(false)
    await waitFor(() => !document.querySelector(CARD))
    // Radix settles focus a task after the card goes.
    await nextTask()
  }

  /** Opens or closes a chapter's pop-out for the steps about it. False when there's no chapter to open. */
  const stage = async (open: boolean) => {
    const state = run.current
    if (state.staged === open) return true
    await hideCard()
    if (open) {
      // A tour started as the Plan opens can get here before its chapters have loaded.
      if (!(await waitFor(() => document.querySelector(PLAN_LOADED)))) return false
      const opener = firstShowing("[data-open-chapter]")
      if (!opener) return false
      opener.click()
      if (!(await waitFor(() => document.querySelector(POPOUT)))) return false
      state.staged = true
      return true
    }
    document.querySelector<HTMLElement>(`${POPOUT} [data-popout-close]`)?.click()
    await waitFor(() => !document.querySelector(POPOUT))
    state.staged = false
    // The pop-out puts focus back on its chapter: let it finish, so it can't pull focus off the card later.
    await nextTask()
    await waitFor(() => !focusPending())
    return true
  }

  /** Readies the page for step `wanted`, or the nearest step past it that the page can show. */
  const prepare = async (wanted: number, direction: 1 | -1) => {
    for (let candidate = wanted; candidate >= 0 && candidate < steps.length; candidate += direction) {
      const { stage: needs, target } = steps[candidate]
      const ready =
        (await stage(needs === "chapter-popout")) && (!needs || !target || (await waitFor(() => findTarget(target))))
      if (run.current.cancelled) return null
      if (ready) return candidate
    }
    return null
  }

  const end = async () => {
    const state = run.current
    if (state.ending) return
    state.ending = true
    // Otherwise the card's onCloseAutoFocus puts focus back.
    if (!state.staged) return endTour()
    await stage(false)
    const opener = useHelp.getState().tourReturn
    endTour()
    if (opener?.isConnected) opener.focus()
  }

  const move = async (wanted: number) => {
    const state = run.current
    if (state.busy || state.ending || wanted < 0) return
    if (wanted >= steps.length) return end()
    state.busy = true
    const direction = wanted < index ? -1 : 1
    state.wentBack = direction < 0
    const landed = await prepare(wanted, direction)
    state.busy = false
    if (state.cancelled) return
    if (landed === null) {
      if (direction > 0) return end()
      setShown(true)
      return
    }
    const next = steps[landed]
    const target = next.target ? findTarget(next.target) : null
    if (target) reveal(target)
    setIndex(landed)
    setAnnouncement(`Step ${landed + 1} of ${steps.length}. ${sentence(next.title)} ${textOf(next.body, context)}`)
    setShown(true)
  }

  return (
    <DialogPrimitive.Root
      open={shown}
      onOpenChange={(open) => {
        if (!open) void end()
      }}
    >
      <DialogPrimitive.Portal>
        <Spotlight box={layout.spot} />
        <DialogPrimitive.Content
          ref={cardRef}
          data-tour-card=""
          style={layout.place ? { left: layout.place.left, top: layout.place.top } : UNPLACED}
          className="fixed z-[61] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const state = run.current
            state.quiet = false
            const back = backRef.current
            const target = state.wentBack && back?.getAttribute("aria-disabled") !== "true" ? back : nextRef.current
            target?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (run.current.quiet) return
            const opener = useHelp.getState().tourReturn
            if (opener?.isConnected) opener.focus()
          }}
          // The page behind is only for looking at: the tour ends from its own buttons or Escape.
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" && !last) {
              event.preventDefault()
              void move(index + 1)
            } else if (event.key === "ArrowLeft" && index > 0) {
              event.preventDefault()
              void move(index - 1)
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="pt-1 text-xs font-medium text-muted-foreground">
              {title} · Step {index + 1} of {steps.length}
            </p>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="End tour" title="End tour" className="-mt-1 -mr-1.5">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="mt-1 font-heading text-lg leading-snug font-semibold text-ink">
            {step.title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 leading-relaxed text-ink-2">
            {textOf(step.body, context)}
          </DialogPrimitive.Description>
          {term && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 self-start rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              onClick={(event) => openGlossary(term.id, event.currentTarget)}
            >
              <BookAIcon aria-hidden="true" className="size-4" />
              What does “{term.term}” mean?
            </button>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              ref={backRef}
              variant="outline"
              size="sm"
              aria-disabled={index === 0}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (index > 0) void move(index - 1)
              }}
            >
              Back
            </Button>
            <Button ref={nextRef} size="sm" onClick={() => void move(index + 1)}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Dims the page except for what the step is about, or all of it when the step isn't about one thing. */
function Spotlight({ box }: { box: Box | null }) {
  if (!box) {
    return (
      <div key="dim" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]" style={{ background: DIM }} />
    )
  }
  return (
    <div
      key="spot"
      aria-hidden="true"
      data-tour-spotlight=""
      className="pointer-events-none fixed z-[60] rounded-lg transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        boxShadow: `0 0 0 2px var(--primary), 0 0 0 9999px ${DIM}`,
      }}
    />
  )
}

/**
 * Where the spotlight and card go, measured every frame while the card shows, so they follow the page as it scrolls,
 * animates or reflows.
 */
function useTourLayout(target: string | undefined, cardRef: RefObject<HTMLDivElement | null>, active: boolean): Layout {
  const [layout, setLayout] = useState<Layout>({ spot: null, place: null })
  useLayoutEffect(() => {
    if (!active) return
    let frame = 0
    let last = ""
    const measure = () => {
      const viewport = viewportSize()
      const element = target ? findTarget(target) : null
      const spot = element
        ? spotlightBox(element.getBoundingClientRect(), viewport, clearBand(element, viewport))
        : null
      const card = cardRef.current
      const place = card ? placeCard(spot, { width: card.offsetWidth, height: card.offsetHeight }, viewport) : null
      const key = JSON.stringify([spot, place])
      if (key !== last) {
        last = key
        setLayout({ spot, place })
      }
      frame = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(frame)
  }, [target, cardRef, active])
  return layout
}
