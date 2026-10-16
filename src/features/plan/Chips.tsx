import { ClockIcon, FlagIcon, MapPinIcon, TagIcon, UsersIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { templateBeatName, type DisplayField } from "./display"
import type { PlanChapter, PlanEntry } from "./planData"
import { statusOf } from "./status"
import { formatStoryTime } from "./storyTime"

const MAX_PRESENT = 4

/** Status as a dot plus the word: color is never the only signal (DESIGN.md §17). */
export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const { label, dot } = statusOf(status)
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-ink-2", className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  )
}

export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-xs text-ink-2",
        "[&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EntryChip({ entry, className }: { entry: PlanEntry | undefined; className?: string }) {
  if (!entry) return null
  return (
    <Chip className={className}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} />
      <span className="truncate">{entry.name}</span>
    </Chip>
  )
}

interface ChapterChipsProps {
  chapter: PlanChapter
  entries: ReadonlyMap<string, PlanEntry>
  fields: ReadonlySet<DisplayField>
  className?: string
}

/** A chapter's threads, labels, location, story time and template beat, as far as `fields` shows them. */
export function MetaChips({ chapter, entries, fields, className }: ChapterChipsProps) {
  const threads = fields.has("threads") ? chapter.threads.flatMap((id) => entries.get(id) ?? []) : []
  const labels = fields.has("labels") ? chapter.labelList : []
  const location =
    fields.has("location") && chapter.location_entry_id ? entries.get(chapter.location_entry_id) : undefined
  const time = fields.has("time") ? formatStoryTime(chapter.time) : ""
  const beat = fields.has("templateBeat") ? chapter.template_beat_key : null
  if (threads.length === 0 && labels.length === 0 && !location && !time && !beat) return null
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {threads.map((entry) => (
        <EntryChip key={entry.id} entry={entry} />
      ))}
      {labels.map((label) => (
        <Chip key={label}>
          <TagIcon aria-hidden="true" />
          <span className="truncate">{label}</span>
        </Chip>
      ))}
      {location && (
        <Chip title="Location">
          <MapPinIcon aria-label="Location" />
          <span className="truncate">{location.name}</span>
        </Chip>
      )}
      {time && (
        <Chip title="Story time">
          <ClockIcon aria-label="Story time" />
          <span className="truncate">{time}</span>
        </Chip>
      )}
      {beat && (
        <Chip title="Template beat">
          <FlagIcon aria-label="Template beat" />
          <span className="truncate">{templateBeatName(beat)}</span>
        </Chip>
      )}
    </div>
  )
}

/** "Mara, Tobin +2": who is in the chapter. Nothing when nobody is linked or `fields` hides it. */
export function PresentLine({ chapter, entries, fields, className }: ChapterChipsProps) {
  const present = fields.has("present") ? chapter.present.flatMap((id) => entries.get(id) ?? []) : []
  if (present.length === 0) return null
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-ink-2", className)}>
      <UsersIcon aria-label="Characters present" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">
        {present
          .slice(0, MAX_PRESENT)
          .map((entry) => entry.name)
          .join(", ")}
        {present.length > MAX_PRESENT && ` +${present.length - MAX_PRESENT}`}
      </span>
    </p>
  )
}
