import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, PenLineIcon } from "lucide-react"
import type { KeyboardEvent } from "react"
import { Link } from "react-router"
import { DraftInput, DraftTextarea } from "@/components/DraftField"
import { buttonVariants } from "@/components/ui/button"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { BOARD_CARD_HELP_ID } from "./ChapterCard"
import { StatusBadge } from "./Chips"
import { cardStep, stepChapter } from "./commands"
import { updateChapter } from "./mutations"
import { usePlanContext } from "./planContext"
import type { PlanChapter } from "./planData"
import { chapterTitle, UNTITLED_CHAPTER } from "./status"

const indexCardClass =
  "relative flex w-full flex-col rounded-sm border bg-page shadow-sm sm:w-[280px] dark:border-white/10"

type Listeners = ReturnType<typeof useSortable>["listeners"]

/**
 * An index card on the Corkboard (DESIGN.md §6): the chapter's title and summary, written right on the card. Drag it
 * by the handle at its top, which also opens its details; Alt+arrows on the handle move it.
 */
export function SortableIndexCard({ chapter }: { chapter: PlanChapter }) {
  const { openId, matches, filtering } = usePlanContext()
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: chapter.id,
  })
  const dimmed = filtering && !matches(chapter)
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-chapter-card={chapter.id}
      data-tour="plan-chapter"
      className={cn(
        indexCardClass,
        "transition-[box-shadow,opacity,filter] hover:shadow-md",
        openId === chapter.id && "border-primary/60 ring-2 ring-primary/40",
        dimmed && "opacity-30 saturate-30 focus-within:opacity-90 focus-within:saturate-100 hover:opacity-80",
        isDragging && "opacity-40",
      )}
    >
      <CardTop chapter={chapter} handleRef={setActivatorNodeRef} listeners={listeners} />
      <CardText chapter={chapter} />
      <CardFooter chapter={chapter} />
    </li>
  )
}

/** The card as it follows the pointer while dragging. */
export function IndexCardOverlay({ chapter }: { chapter: PlanChapter }) {
  const untitled = !chapter.title?.trim()
  return (
    <div className={cn(indexCardClass, "rotate-1 cursor-grabbing shadow-xl")}>
      <CardTop chapter={chapter} />
      <div className="px-4 pt-2 pb-2">
        <p className={cn("font-heading text-base font-semibold", untitled && "font-normal text-muted-foreground italic")}>
          {chapterTitle(chapter.title)}
        </p>
        <p className="ruled-lines mt-1 line-clamp-5 min-h-30 text-[0.8125rem] whitespace-pre-line text-ink-2">
          {chapter.summary}
        </p>
      </div>
      <CardFooter chapter={chapter} />
    </div>
  )
}

function CardTop({
  chapter,
  handleRef,
  listeners,
}: {
  chapter: PlanChapter
  handleRef?: (element: HTMLElement | null) => void
  listeners?: Listeners
}) {
  const { db, bookId, plan, showChapter, focusItem } = usePlanContext()
  const label = (
    <>
      <GripVerticalIcon aria-hidden="true" className="size-3.5" />
      Chapter <span className="tabular-nums">{chapter.number}</span>
    </>
  )

  const onKeyDown = (event: KeyboardEvent) => {
    const step = cardStep(event)
    if (!step) return
    // Alt+← is also the browser's Back.
    event.preventDefault()
    void stepChapter(db, plan, chapter.id, step, false, focusItem)
  }

  return (
    // The red rule across the top of an index card.
    <div className="flex items-center gap-1 border-b-2 border-destructive/30 px-2 py-1">
      {handleRef ? (
        <button
          ref={handleRef}
          type="button"
          {...listeners}
          data-focus-chapter={chapter.id}
          data-open-chapter={chapter.id}
          aria-label={`Chapter ${chapter.number}: ${chapterTitle(chapter.title)}`}
          aria-describedby={BOARD_CARD_HELP_ID}
          title="Drag to move the card. Click for the chapter's details."
          onClick={() => showChapter(chapter.id)}
          onKeyDown={onKeyDown}
          className="flex h-7 cursor-grab touch-manipulation items-center gap-1 rounded-md px-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none select-none [-webkit-touch-callout:none] hover:bg-surface-2 hover:text-ink-2 focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing pointer-coarse:h-11"
        >
          {label}
        </button>
      ) : (
        <span className="flex h-7 items-center gap-1 px-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      )}
      <StatusBadge status={chapter.status} className="ml-auto" />
      {handleRef && (
        <Link
          to={`/b/${bookId}/write/${chapter.id}`}
          aria-label={`Write chapter ${chapter.number}`}
          title="Write"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "-mr-1 text-muted-foreground")}
        >
          <PenLineIcon />
        </Link>
      )}
    </div>
  )
}

/** The title and summary, edited in place. */
function CardText({ chapter }: { chapter: PlanChapter }) {
  const { db } = usePlanContext()
  return (
    <div className="px-2.5 pt-1.5 pb-1">
      <DraftInput
        value={chapter.title ?? ""}
        onSave={(title) => updateChapter(db, chapter.id, { title })}
        data-index-title={chapter.id}
        aria-label={`Title of chapter ${chapter.number}`}
        placeholder={UNTITLED_CHAPTER}
        className="h-8 border-transparent bg-transparent px-1.5 font-heading text-base font-semibold shadow-none hover:border-input md:text-base dark:bg-transparent"
      />
      <DraftTextarea
        value={chapter.summary ?? ""}
        onSave={(summary) => updateChapter(db, chapter.id, { summary })}
        data-index-summary={chapter.id}
        aria-label={`Summary of chapter ${chapter.number}`}
        placeholder="What happens in this chapter?"
        className="ruled-lines mt-0.5 max-h-48 min-h-30 resize-none rounded-sm border-transparent bg-transparent px-1.5 py-0 text-[0.8125rem] text-ink-2 shadow-none hover:border-input md:text-[0.8125rem] dark:bg-transparent"
      />
    </div>
  )
}

function CardFooter({ chapter }: { chapter: PlanChapter }) {
  const target = chapter.word_target ?? 0
  return (
    <p className="mt-auto border-t border-dashed px-4 py-1.5 text-[0.7rem] text-muted-foreground tabular-nums">
      {formatCount(chapter.words)}
      {target > 0 ? ` / ${formatCount(target)}` : ""} words
      {chapter.beats.length > 0 &&
        ` · ${chapter.beats.length} ${chapter.beats.length === 1 ? "moment" : "moments"}`}
    </p>
  )
}
