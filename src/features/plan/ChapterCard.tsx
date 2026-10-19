import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { PenLineIcon, SquareCheckIcon, SquareIcon } from "lucide-react"
import { memo, type KeyboardEvent } from "react"
import { Link } from "react-router"
import { buttonVariants } from "@/components/ui/button"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { EntryChip, MetaChips, PresentLine, StatusBadge } from "./Chips"
import { cardStep, stepChapter } from "./commands"
import type { DisplayField } from "./display"
import { usePlanContext } from "./planContext"
import type { PlanChapter } from "./planData"
import { chapterTitle } from "./status"

export const BOARD_CARD_HELP_ID = "board-card-help"

const MAX_BEATS = 4

const cardClass =
  "relative w-full rounded-xl border bg-page p-3 shadow-sm select-none [-webkit-touch-callout:none] sm:w-[268px]"

/** A chapter card on the Board: drag it, click it for its details, Alt+arrows to move it. */
export function SortableChapterCard({ chapter }: { chapter: PlanChapter }) {
  const { openId, matches, filtering } = usePlanContext()
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: chapter.id })
  const dimmed = filtering && !matches(chapter)
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-chapter-card={chapter.id}
      data-tour="plan-chapter"
      className={cn(
        cardClass,
        "touch-manipulation transition-[box-shadow,opacity,filter] hover:shadow-md",
        openId === chapter.id && "border-primary/60 ring-2 ring-primary/40",
        dimmed && "opacity-30 saturate-30 focus-within:opacity-90 focus-within:saturate-100 hover:opacity-80",
        isDragging && "opacity-40",
      )}
    >
      <ChapterCardBody chapter={chapter} interactive />
    </li>
  )
}

/** The card as it follows the pointer while dragging. */
export function ChapterCardOverlay({ chapter }: { chapter: PlanChapter }) {
  return (
    <div className={cn(cardClass, "rotate-1 cursor-grabbing shadow-xl")}>
      <ChapterCardBody chapter={chapter} interactive={false} />
    </div>
  )
}

/** Memoized, so a drag, which renders every card around it, leaves what's on them be. */
const ChapterCardBody = memo(function ChapterCardBody({
  chapter,
  interactive,
}: {
  chapter: PlanChapter
  interactive: boolean
}) {
  const { db, bookId, plan, display, showChapter, focusItem } = usePlanContext()
  const has = (field: DisplayField) => display.fields.has(field)
  const title = chapterTitle(chapter.title)
  const untitled = !chapter.title?.trim()
  const pov = chapter.pov_entry_id ? plan.entries.get(chapter.pov_entry_id) : undefined
  const doneBeats = chapter.beats.filter((beat) => beat.done).length
  const target = chapter.word_target ?? 0
  const percent = target > 0 ? Math.min(100, Math.round((chapter.words / target) * 100)) : 0

  const onKeyDown = (event: KeyboardEvent) => {
    const step = cardStep(event)
    if (!step) return
    // Alt+← is also the browser's Back.
    event.preventDefault()
    void stepChapter(db, plan, chapter.id, step, false, focusItem)
  }

  return (
    <>
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 flex w-8 shrink-0 flex-col items-center rounded-md bg-surface-2 py-1 text-[0.625rem] leading-tight font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Ch
          <span className="text-sm tracking-normal text-ink-2 tabular-nums">{chapter.number}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-[0.95rem] leading-snug font-semibold text-ink">
            {interactive ? (
              <button
                type="button"
                data-focus-chapter={chapter.id}
                data-open-chapter={chapter.id}
                aria-label={`Chapter ${chapter.number}: ${title}`}
                aria-describedby={BOARD_CARD_HELP_ID}
                onClick={() => showChapter(chapter.id)}
                onKeyDown={onKeyDown}
                className="text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
              >
                <span className={cn("line-clamp-2", untitled && "font-normal text-muted-foreground italic")}>{title}</span>
              </button>
            ) : (
              <span className={cn("line-clamp-2", untitled && "font-normal text-muted-foreground italic")}>{title}</span>
            )}
          </h3>
          {(has("status") || (has("pov") && pov)) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {has("status") && <StatusBadge status={chapter.status} />}
              {has("pov") && pov && <EntryChip entry={pov} />}
            </div>
          )}
        </div>
        {interactive && (
          <Link
            to={`/b/${bookId}/write/${chapter.id}`}
            aria-label={`Write chapter ${chapter.number}`}
            title="Write"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative z-10 -mt-1 -mr-1 text-muted-foreground")}
          >
            <PenLineIcon />
          </Link>
        )}
      </div>

      {has("summary") && (
        <p className="mt-2 line-clamp-3 text-[0.8125rem] leading-relaxed text-ink-2">
          {chapter.summary?.trim() || <span className="text-muted-foreground italic">No summary yet</span>}
        </p>
      )}

      <MetaChips chapter={chapter} entries={plan.entries} fields={display.fields} className="mt-2" />
      <PresentLine chapter={chapter} entries={plan.entries} fields={display.fields} className="mt-2" />

      {has("beats") && chapter.beats.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-2" aria-label="Moments">
          {chapter.beats.slice(0, MAX_BEATS).map((beat) => (
            <li key={beat.id} className="flex items-start gap-1.5">
              {beat.done ? (
                <SquareCheckIcon aria-label="Done" className="mt-px size-3.5 shrink-0 text-status-done" />
              ) : (
                <SquareIcon aria-label="To do" className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={cn("line-clamp-1", beat.done && "text-muted-foreground line-through")}>
                {beat.text?.trim() || "Untitled moment"}
              </span>
            </li>
          ))}
          {chapter.beats.length > MAX_BEATS && (
            <li className="pl-5 text-muted-foreground">+{chapter.beats.length - MAX_BEATS} more</li>
          )}
        </ul>
      )}

      {has("words") && (
        <div className="mt-2.5">
          {target > 0 && (
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${percent}%` }} />
            </div>
          )}
          <p className="mt-1 text-[0.7rem] text-muted-foreground tabular-nums">
            {formatCount(chapter.words)}
            {target > 0 ? ` / ${formatCount(target)}` : ""} words
            {chapter.beats.length > 0 && ` · ${doneBeats}/${chapter.beats.length} moments`}
          </p>
        </div>
      )}
    </>
  )
})
