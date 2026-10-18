import { MilestoneIcon } from "lucide-react"
import { useId, useMemo, useState, type KeyboardEvent } from "react"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { TermHint } from "@/features/help/TermHint"
import { focusSoon } from "@/lib/focus"
import { useElementWidth } from "@/lib/useElementWidth"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { setChapterMoment } from "./mutations"
import { usePlanContext } from "./planContext"
import type { PlanChapter } from "./planData"
import { MAX_PIN_TIERS, pinTiers } from "./ribbonLayout"
import { chapterTitle } from "./status"
import { overlayStructure, type BeatPlacement, type StoryStructure } from "./structures"

/** Pins closer than this, center to center, go on separate rows. */
const PIN_GAP = 26
const ROW_HEIGHT = 28
/** On touch screens a pin's hit area is 44px (DESIGN.md §16), so pins and rows are spaced to keep them apart. */
const TOUCH_SPACING = 44
/** The stem below the lowest row of pins. */
const STEM = 8
/** A chapter's number shows on the bar when its stretch is at least this wide. */
const MIN_NUMBER_WIDTH = 20

const chapterName = (chapter: PlanChapter) => `Ch ${chapter.number}: ${chapterTitle(chapter.title)}`

/**
 * The structure ribbon (DESIGN.md §6 "Templates"): the book's story structure laid over the Board and Corkboard. A
 * bar stands for the book, split into its chapters by word count target; numbered pins above it show where each
 * structure moment should land. A filled pin has a chapter marked as that moment. Opening a pin explains the moment
 * and marks or unmarks chapters.
 */
export function StructureRibbon() {
  const { structures, ribbonShown, setRibbonShown } = usePlanContext()
  if (!structures.current || !ribbonShown) return null
  return (
    <Ribbon
      structure={structures.current}
      onHide={() => {
        setRibbonShown(false)
        announce("Structure ribbon hidden. The Structure menu shows it again.")
        focusSoon('[data-tour="plan-structure"]')
      }}
    />
  )
}

function Ribbon({ structure, onHide }: { structure: StoryStructure; onHide: () => void }) {
  const { plan } = usePlanContext()
  const overlay = useMemo(() => overlayStructure(structure, plan.chapters), [structure, plan.chapters])
  const [trackRef, width] = useElementWidth<HTMLDivElement>()
  const coarse = useMediaQuery("(pointer: coarse)")
  const gap = coarse ? TOUCH_SPACING : PIN_GAP
  const rowHeight = coarse ? TOUCH_SPACING : ROW_HEIGHT
  const tiers = useMemo(
    () => pinTiers(overlay.placements.map((placement) => placement.at), width, gap, MAX_PIN_TIERS),
    [overlay, width, gap],
  )
  const rows = Math.max(0, ...tiers) + 1
  const marked = overlay.placements.filter((placement) => placement.mapped.length > 0).length
  const roomy = ({ start, end }: { start: number; end: number }) => width * (end - start) >= MIN_NUMBER_WIDTH
  // Numbering only the few segments wide enough reads as random, so the bar numbers most of them or none.
  const numbered = overlay.segments.filter(roomy).length * 2 >= overlay.segments.length
  const ownKeys = useMemo(() => new Set(structure.beats.map((item) => item.key)), [structure])
  const [focusIndex, setFocusIndex] = useState(0)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const headingId = useId()

  // Arrow keys move between pins, so the ribbon is one stop for Tab.
  const onPinKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = overlay.placements.length - 1
    const next =
      event.key === "ArrowRight"
        ? Math.min(last, index + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setFocusIndex(next)
    event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-ribbon-pin="${next}"]`)?.focus()
  }

  return (
    <section
      aria-labelledby={headingId}
      data-tour="plan-ribbon"
      className="mb-6 rounded-xl border bg-surface px-3 pt-2.5 pb-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <h2 id={headingId} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <MilestoneIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            {structure.name}
          </h2>
          <TermHint term="structure-ribbon" />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {marked} of {overlay.placements.length} moments marked · placed by{" "}
          {overlay.basis === "targets" ? "word count targets" : "number of chapters"}
        </p>
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onHide}>
          Hide
        </Button>
      </div>
      <div className="mx-3">
        <div
          ref={trackRef}
          role="toolbar"
          aria-label="Structure moments"
          className="relative"
          style={{ height: rows * rowHeight + STEM }}
        >
          {overlay.placements.map((placement, index) => (
            <MomentPin
              key={placement.beat.key}
              placement={placement}
              lift={STEM + (tiers[index] ?? 0) * rowHeight}
              tabbable={index === Math.min(focusIndex, overlay.placements.length - 1)}
              open={openKey === placement.beat.key}
              onOpenChange={(open) => setOpenKey(open ? placement.beat.key : null)}
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(event) => onPinKey(event, index)}
            />
          ))}
        </div>
        <div aria-hidden="true" className="flex h-4 overflow-hidden rounded-sm border bg-muted/60">
          {overlay.segments.map((segment) => (
            <div
              key={segment.chapter.id}
              title={chapterName(segment.chapter)}
              style={{ width: `${(segment.end - segment.start) * 100}%` }}
              className={cn(
                "grid shrink-0 place-items-center overflow-hidden border-r border-background text-[0.625rem] leading-none text-ink-3 tabular-nums last:border-r-0",
                segment.chapter.template_beat_key &&
                  ownKeys.has(segment.chapter.template_beat_key) &&
                  "bg-primary/20 text-ink-2",
              )}
            >
              {numbered && roomy(segment) && segment.chapter.number}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MomentPin({
  placement,
  lift,
  tabbable,
  open,
  onOpenChange,
  onFocus,
  onKeyDown,
}: {
  placement: BeatPlacement<PlanChapter>
  /** How far above the track's foot the pin sits, in pixels. */
  lift: number
  tabbable: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const { beat, index, at, mapped } = placement
  const number = index + 1
  const state =
    mapped.length > 0 ? `marked in ${mapped.map((chapter) => `Ch ${chapter.number}`).join(", ")}` : "not marked yet"
  const titleId = useId()
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <span
        aria-hidden="true"
        className="absolute bottom-0 w-px -translate-x-1/2 bg-border"
        style={{ left: `${at * 100}%`, height: lift }}
      />
      <PopoverTrigger asChild>
        <button
          type="button"
          data-ribbon-pin={index}
          tabIndex={tabbable ? 0 : -1}
          title={beat.name}
          aria-label={`${number}. ${beat.name}, ${state}`}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute z-10 grid size-[22px] -translate-x-1/2 place-items-center rounded-full border text-[0.6875rem] font-semibold tabular-nums transition-[scale] outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.25",
            mapped.length > 0
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-dashed border-ink-3 bg-surface text-ink-2",
          )}
          style={{ left: `${at * 100}%`, bottom: lift }}
        >
          {number}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        collisionPadding={12}
        aria-labelledby={titleId}
        aria-describedby={beat.description ? `${titleId}-about` : undefined}
      >
        <MomentDetails placement={placement} titleId={titleId} onDone={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  )
}

function MomentDetails({
  placement,
  titleId,
  onDone,
}: {
  placement: BeatPlacement<PlanChapter>
  titleId: string
  onDone: () => void
}) {
  const { db, structures, showChapter } = usePlanContext()
  const { beat, index, at, mapped, spanning } = placement
  const elsewhere = spanning?.template_beat_key ? structures.momentName(spanning.template_beat_key) : null

  const mark = async (chapter: PlanChapter, key: string | null) => {
    onDone()
    const changes = await attempt("mark structure moment", setChapterMoment(db, chapter.id, key))
    if (!changes) return
    offerUndo(db, key ? `Ch ${chapter.number} marked as ${beat.name}` : `Ch ${chapter.number} unmarked`, changes)
  }

  return (
    <>
      <PopoverHeader>
        <PopoverTitle id={titleId}>
          {index + 1}. {beat.name}
        </PopoverTitle>
        {beat.description && <PopoverDescription id={`${titleId}-about`}>{beat.description}</PopoverDescription>}
      </PopoverHeader>
      <p className="text-xs text-ink-2">
        About {Math.round(at * 100)}% of the way through{spanning ? `, in Ch ${spanning.number}` : ""}.
      </p>
      {mapped.length > 0 ? (
        <div className="grid gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Marked in</h3>
          <ul className="grid gap-0.5">
            {mapped.map((chapter) => (
              <li key={chapter.id} className="flex items-center gap-1">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto min-w-0 flex-1 justify-start px-0 py-1 text-ink"
                  onClick={() => {
                    onDone()
                    showChapter(chapter.id)
                  }}
                >
                  <span className="truncate">{chapterName(chapter)}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Unmark Ch ${chapter.number}`}
                  onClick={() => void mark(chapter, null)}
                >
                  Unmark
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No chapter is marked as this moment yet.</p>
      )}
      {spanning && !mapped.includes(spanning) && (
        <div className="grid gap-1.5 border-t pt-2.5">
          {elsewhere && (
            <p className="text-xs text-ink-2">
              Ch {spanning.number} is marked as “{elsewhere.name}” now. This replaces it.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => void mark(spanning, beat.key)}>
            Mark Ch {spanning.number} as this moment
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        To mark another chapter, open it and choose this moment under Structure moment.
      </p>
    </>
  )
}
