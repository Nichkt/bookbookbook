import { ClockIcon } from "lucide-react"
import { useId, useState, type FormEvent } from "react"
import { attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DAY_PARTS,
  formatStoryTime,
  normalizeStoryTime,
  serializeStoryTime,
  type DayPart,
  type StoryTime,
} from "./storyTime"

const ANY_PART = "__any"
const DEFAULT_ERA = "flashback"

interface TimeDraft {
  mode: StoryTime["mode"]
  day: string
  part: DayPart | ""
  date: string
  clock: string
  label: string
  outside: boolean
  era: string
}

function toDraft(time: StoryTime | null): TimeDraft {
  const [date = "", clock = ""] = (time?.date ?? "").split("T")
  return {
    mode: time?.mode ?? "relative",
    day: time?.day === undefined ? "" : String(time.day),
    part: time?.part ?? "",
    date,
    clock,
    label: time?.label ?? "",
    outside: !!time?.era,
    era: time?.era ?? "",
  }
}

function fromDraft(draft: TimeDraft): StoryTime | null {
  const day = draft.day.trim()
  return normalizeStoryTime({
    mode: draft.mode,
    day: /^-?\d+$/.test(day) ? Number(day) : undefined,
    part: draft.part || undefined,
    date: draft.date ? (draft.clock ? `${draft.date}T${draft.clock}` : draft.date) : undefined,
    label: draft.label,
    era: draft.outside ? draft.era.trim() || DEFAULT_ERA : undefined,
  })
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

interface StoryTimeEditorProps {
  labelId: string
  value: StoryTime | null
  /** Gets the serialized value, or null to clear. */
  onSave: (raw: string | null) => Promise<unknown> | void
}

/** When a chapter happens (DESIGN.md §6): a story day and part of day, or a calendar date, plus a label. */
export function StoryTimeEditor({ labelId, value, onSave }: StoryTimeEditorProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => toDraft(value))
  const text = formatStoryTime(value)

  const save = (next: StoryTime | null) => {
    const raw = serializeStoryTime(next)
    if (raw !== serializeStoryTime(value)) void attempt("save story time", Promise.resolve(onSave(raw)))
  }

  const onOpenChange = (next: boolean) => {
    if (next) setDraft(toDraft(value))
    else save(fromDraft(draft))
    setOpen(next)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    onOpenChange(false)
  }

  const clear = () => {
    save(null)
    setOpen(false)
  }

  const update = (patch: Partial<TimeDraft>) => setDraft((current) => ({ ...current, ...patch }))

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={`${id}-trigger`}
          variant="outline"
          aria-labelledby={`${labelId} ${id}-trigger`}
          className="w-full justify-start gap-2 px-2.5 font-normal"
        >
          <ClockIcon aria-hidden="true" className="text-muted-foreground" />
          {text ? <span className="truncate">{text}</span> : <span className="text-muted-foreground">Not set</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-labelledby={`${id}-title`} className="w-80">
        <form onSubmit={onSubmit} className="grid gap-3">
          <PopoverHeader>
            <PopoverTitle id={`${id}-title`}>Story time</PopoverTitle>
            <PopoverDescription>When this chapter happens in the story.</PopoverDescription>
          </PopoverHeader>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Kind of time"
            value={draft.mode}
            onValueChange={(mode) => {
              if (mode === "relative" || mode === "date") update({ mode })
            }}
            className="w-full"
          >
            <ToggleGroupItem value="relative" className="flex-1">
              Story day
            </ToggleGroupItem>
            <ToggleGroupItem value="date" className="flex-1">
              Calendar date
            </ToggleGroupItem>
          </ToggleGroup>
          {draft.mode === "relative" ? (
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-day`}>Day</Label>
                <Input
                  id={`${id}-day`}
                  inputMode="numeric"
                  placeholder="1"
                  value={draft.day}
                  onChange={(event) => update({ day: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-part`}>Part of day</Label>
                <Select
                  value={draft.part || ANY_PART}
                  onValueChange={(part) => update({ part: part === ANY_PART ? "" : (part as DayPart) })}
                >
                  <SelectTrigger id={`${id}-part`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={ANY_PART}>Any time</SelectItem>
                    {DAY_PARTS.map((part) => (
                      <SelectItem key={part} value={part}>
                        {capitalize(part)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-date`}>Date</Label>
                <Input
                  id={`${id}-date`}
                  type="date"
                  value={draft.date}
                  onChange={(event) => update({ date: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-clock`}>Time</Label>
                <Input
                  id={`${id}-clock`}
                  type="time"
                  value={draft.clock}
                  disabled={!draft.date}
                  onChange={(event) => update({ clock: event.target.value })}
                />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-label`}>Label</Label>
            <Input
              id={`${id}-label`}
              placeholder="Twelve years earlier"
              aria-describedby={`${id}-label-help`}
              value={draft.label}
              onChange={(event) => update({ label: event.target.value })}
            />
            <p id={`${id}-label-help`} className="text-xs text-muted-foreground">
              Optional. Cards show it before the day or date.
            </p>
          </div>
          <div className="flex items-center gap-2 pointer-coarse:min-h-11">
            <Checkbox
              id={`${id}-outside`}
              checked={draft.outside}
              onCheckedChange={(checked) => update({ outside: checked === true, era: draft.era || DEFAULT_ERA })}
            />
            <Label htmlFor={`${id}-outside`} className="font-normal">
              Outside the main timeline
            </Label>
          </div>
          {draft.outside && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-era`}>Name it</Label>
              <Input
                id={`${id}-era`}
                placeholder={DEFAULT_ERA}
                value={draft.era}
                onChange={(event) => update({ era: event.target.value })}
              />
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!value}>
              Clear
            </Button>
            <Button type="submit" size="sm">
              Done
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
