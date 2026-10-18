import { useQuery } from "@powersync/react"
import { CalendarClockIcon, SignpostIcon, Undo2Icon } from "lucide-react"
import { useMemo, type ReactNode } from "react"
import { Link } from "react-router"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePref } from "@/db/prefs"
import { cn } from "@/lib/utils"
import { capitalize } from "./commands"
import { usePlanContext } from "./planContext"
import type { PlanChapter } from "./planData"
import { chapterTitle, statusOf } from "./status"
import { formatStoryTime } from "./storyTime"
import {
  EVENTS_SQL,
  eventsFromRows,
  laneOf,
  readingOrder,
  storyOrder,
  type EventRow,
  type TimeJump,
  type TimelineEvent,
  type TimelineLane,
} from "./timelineData"

/*
 * The Timeline (DESIGN.md §6): the chapters by when they happen, or as the reader meets them, one row per
 * point-of-view character. It only shows the plan: story times are set in a chapter's details.
 */

type TimelineOrder = "story" | "reading"
const timelineOrderKey = (bookId: string) => `plan.timeline:${bookId}`
const isOrder = (value: unknown): value is TimelineOrder => value === "story" || value === "reading"

const ORDER_HINTS: Record<TimelineOrder, string> = {
  story: "When each chapter happens in the story. Flashbacks and other stretches outside the main story come first.",
  reading: "The chapters as readers meet them, with each jump in time marked.",
}

/** Clear of the sticky toolbar above and the lanes column on the left. */
const itemScroll = "scroll-mt-28 scroll-mb-8 scroll-ml-36 sm:scroll-ml-44 pointer-coarse:scroll-mt-30"

const laneHeader =
  "sticky left-0 z-10 w-36 max-w-36 min-w-36 border-b bg-page px-3 py-2 text-left align-top font-normal sm:w-44 " +
  "sm:max-w-44 sm:min-w-44"

export function Timeline() {
  const { bookId, plan } = usePlanContext()
  const { value, isLoading: orderLoading, setValue } = usePref(timelineOrderKey(bookId))
  const order: TimelineOrder = isOrder(value) ? value : "story"
  const { data: eventRows, isLoading: eventsLoading } = useQuery<EventRow>(EVENTS_SQL, [bookId])
  const events = useMemo(() => eventsFromRows(eventRows), [eventRows])

  // Not till the order and the events have loaded, so the view doesn't switch order or shift down once shown.
  if (orderLoading || eventsLoading) return null

  if (plan.chapters.length === 0) {
    return (
      <div className="px-4 pt-4 pb-10 sm:px-6">
        <Empty>No chapters yet. Add one with the Chapter button above.</Empty>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-10 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ToggleGroup
          type="single"
          spacing={1}
          aria-label="Order"
          data-tour="plan-timeline-order"
          value={order}
          onValueChange={(next) => isOrder(next) && void setValue(next)}
          className="shrink-0 gap-0 rounded-lg bg-muted p-0.5"
        >
          {(["story", "reading"] as const).map((name) => (
            <ToggleGroupItem
              key={name}
              value={name}
              className="h-7 rounded-md px-2.5 text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-background data-[state=on]:text-ink data-[state=on]:shadow-sm pointer-coarse:h-11"
            >
              {name === "story" ? "Story order" : "Reading order"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="min-w-0 flex-1 text-xs text-ink-2">{ORDER_HINTS[order]}</p>
      </div>
      {order === "story" ? <StoryOrderView events={events} /> : <ReadingOrderView />}
    </div>
  )
}

function StoryOrderView({ events }: { events: TimelineEvent[] }) {
  const { plan } = usePlanContext()
  const story = useMemo(() => storyOrder(plan, events), [plan, events])
  const mainSpan = story.slots.filter((slot) => !slot.era).length
  const hasEvents = story.slots.some((slot) => slot.events.length > 0)
  const lastEra = story.slots.findLastIndex((slot) => slot.era)

  return (
    <>
      {story.slots.length === 0 ? (
        <Empty>
          Nothing is placed in time yet. Open a chapter and give it a story time, like “Day 3, evening” or a date, and it
          appears here.
        </Empty>
      ) : (
        <div data-tour="plan-timeline" className="relative w-fit max-w-full overflow-x-auto rounded-xl border bg-page shadow-sm">
          <table
            aria-label="Timeline: chapters in story order"
            data-timeline="story"
            className="border-separate border-spacing-0 text-sm"
          >
            <thead>
              {story.eras.length > 0 && (
                <tr>
                  <td className="sticky left-0 z-10 bg-page" />
                  {story.eras.map((era) => (
                    <th
                      key={era.era}
                      scope="colgroup"
                      colSpan={era.span}
                      title="Outside the main story"
                      className="border-b border-l bg-surface/70 px-2 pt-2 pb-1 text-left text-xs font-semibold text-ink-2"
                    >
                      <span className="inline-flex items-center gap-1">
                        <SignpostIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                        <span className="sr-only">Outside the main story: </span>
                        {capitalize(era.era)}
                      </span>
                    </th>
                  ))}
                  {mainSpan > 0 && (
                    <th
                      scope="colgroup"
                      colSpan={mainSpan}
                      className="border-b border-l-2 px-2 pt-2 pb-1 text-left text-xs font-semibold text-ink-2"
                    >
                      Main story
                    </th>
                  )}
                </tr>
              )}
              <tr>
                <td className="sticky left-0 z-10 border-b bg-page" />
                {story.slots.map((slot, index) => (
                  <th
                    key={slot.key}
                    scope="col"
                    className={cn(
                      "min-w-40 border-b border-l px-2 py-2 text-left align-bottom text-xs font-semibold text-ink",
                      slot.era && "bg-surface/70 italic",
                      index === lastEra + 1 && lastEra >= 0 && "border-l-2",
                    )}
                  >
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hasEvents && (
                <tr>
                  <th scope="row" className={cn(laneHeader, "text-xs font-semibold text-muted-foreground uppercase")}>
                    Events
                  </th>
                  {story.slots.map((slot, index) => (
                    <td
                      key={slot.key}
                      className={cn(
                        "border-b border-l p-1.5 align-top",
                        slot.era && "bg-surface/70",
                        index === lastEra + 1 && lastEra >= 0 && "border-l-2",
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        {slot.events.map((event) => (
                          <EventMarker key={event.id} event={event} />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              )}
              {story.lanes.map((lane) => (
                <tr key={lane.key}>
                  <th scope="row" className={laneHeader}>
                    <LaneName lane={lane} />
                  </th>
                  {story.slots.map((slot, index) => (
                    <td
                      key={slot.key}
                      className={cn(
                        "border-b border-l p-1.5 align-top",
                        slot.era && "bg-surface/70",
                        index === lastEra + 1 && lastEra >= 0 && "border-l-2",
                      )}
                    >
                      <div className="flex flex-col gap-1.5">
                        {slot.chapters
                          .filter((chapter) => laneOf(plan, chapter) === lane.key)
                          .map((chapter) => (
                            <ChapterItem key={chapter.id} chapter={chapter} />
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Unplaced chapters={story.unplaced} events={story.unplacedEvents} />
    </>
  )
}

function ReadingOrderView() {
  const { plan } = usePlanContext()
  const reading = useMemo(() => readingOrder(plan), [plan])
  return (
    <div data-tour="plan-timeline" className="relative w-fit max-w-full overflow-x-auto rounded-xl border bg-page shadow-sm">
      <table
        aria-label="Timeline: chapters in reading order"
        data-timeline="reading"
        className="border-separate border-spacing-0 text-sm"
      >
        <thead>
          <tr>
            <td className="sticky left-0 z-10 border-b bg-page" />
            {reading.columns.map(({ chapter, jump }) => {
              const time = formatStoryTime(chapter.time)
              return (
                <th
                  key={chapter.id}
                  scope="col"
                  className="min-w-40 border-b border-l px-2 py-2 text-left align-bottom text-xs font-normal"
                >
                  <span className={cn("block font-semibold", time ? "text-ink" : "text-muted-foreground italic")}>
                    {time || "No story time"}
                  </span>
                  {jump && <JumpBadge jump={jump} />}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {reading.lanes.map((lane) => (
            <tr key={lane.key}>
              <th scope="row" className={laneHeader}>
                <LaneName lane={lane} />
              </th>
              {reading.columns.map(({ chapter }) => (
                <td key={chapter.id} className="border-b border-l p-1.5 align-top">
                  {laneOf(plan, chapter) === lane.key && <ChapterItem chapter={chapter} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JumpBadge({ jump }: { jump: TimeJump }) {
  if (jump.kind === "back") {
    return (
      <span
        data-time-jump="back"
        title={`Happens before chapter ${jump.from}, which readers have already read`}
        className="mt-1 inline-flex items-center gap-1 rounded-full bg-status-revising/12 px-1.5 py-0.5 text-[0.7rem] font-medium text-status-revising"
      >
        <Undo2Icon aria-hidden="true" className="size-3" />
        Back in time (before ch {jump.from})
      </span>
    )
  }
  return (
    <span
      data-time-jump="outside"
      title="Outside the main story"
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-status-drafting/12 px-1.5 py-0.5 text-[0.7rem] font-medium text-status-drafting"
    >
      <SignpostIcon aria-hidden="true" className="size-3" />
      <span className="sr-only">Outside the main story: </span>
      {capitalize(jump.era)}
    </span>
  )
}

function LaneName({ lane }: { lane: TimelineLane }) {
  if (!lane.entry) return <span className="text-muted-foreground italic">No point of view</span>
  return (
    <span className="flex items-center gap-2 text-ink" title={lane.entry.name}>
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: lane.entry.color }} />
      <span className="truncate">{lane.entry.name}</span>
    </span>
  )
}

/** A chapter on the Timeline. It opens the chapter's details, where its story time is set. */
function ChapterItem({ chapter }: { chapter: PlanChapter }) {
  const { plan, openId, matches, filtering, showChapter } = usePlanContext()
  const title = chapterTitle(chapter.title)
  const status = statusOf(chapter.status)
  const pov = chapter.pov_entry_id ? plan.entries.get(chapter.pov_entry_id) : undefined
  const dimmed = filtering && !matches(chapter)
  return (
    <button
      type="button"
      data-focus-chapter={chapter.id}
      data-open-chapter={chapter.id}
      data-timeline-chapter={chapter.id}
      aria-label={`Chapter ${chapter.number}: ${title}`}
      onClick={() => showChapter(chapter.id)}
      style={pov ? { borderLeftColor: pov.color } : undefined}
      className={cn(
        "flex w-40 flex-col gap-0.5 rounded-lg border border-l-4 bg-surface px-2.5 py-1.5 text-left shadow-xs outline-none",
        "transition-[box-shadow,opacity] hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50",
        itemScroll,
        openId === chapter.id && "ring-2 ring-primary/40",
        dimmed && "opacity-35 focus-visible:opacity-100 hover:opacity-80",
      )}
    >
      <span className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", status.dot)} />
        Ch <span className="tabular-nums">{chapter.number}</span>
      </span>
      <span className={cn("line-clamp-2 text-xs font-medium text-ink", !chapter.title?.trim() && "italic")}>
        {title}
      </span>
    </button>
  )
}

/** An event from the World, linked to its entry. */
function EventMarker({ event }: { event: TimelineEvent }) {
  const { bookId } = usePlanContext()
  return (
    <Link
      to={`/b/${bookId}/world/${event.id}`}
      data-timeline-event={event.id}
      title={event.when ? `${event.name} (${event.when})` : event.name}
      className={cn(
        "flex w-40 items-start gap-1.5 rounded-md px-1.5 py-1 text-xs text-ink-2 outline-none",
        "hover:bg-accent hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50",
        itemScroll,
      )}
    >
      <span aria-hidden="true" className="mt-1 size-2 shrink-0 rotate-45 rounded-[1px]" style={{ background: event.color }} />
      <span className="line-clamp-2">{event.name}</span>
    </Link>
  )
}

function Unplaced({ chapters, events }: { chapters: PlanChapter[]; events: TimelineEvent[] }) {
  if (chapters.length === 0 && events.length === 0) return null
  return (
    <section aria-labelledby="timeline-unplaced" data-timeline-unplaced="" className="mt-6">
      <h2 id="timeline-unplaced" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <CalendarClockIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        Not placed in time
      </h2>
      <p className="mt-0.5 text-xs text-ink-2">
        To place a chapter, open it and set its story time to a day, like “Day 3”, or a date. Events go by the When
        field of their World entry.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <ChapterItem chapter={chapter} />
          </li>
        ))}
        {events.map((event) => (
          <li key={event.id}>
            <EventMarker event={event} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
