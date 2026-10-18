import { usePowerSync, useQuery } from "@powersync/react"
import { CircleCheckIcon, FlameIcon, TimerIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react"
import { attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProgressBar } from "@/components/WordProgress"
import { usePref } from "@/db/prefs"
import { DAILY_NET_SQL, DEVICE_NET_SINCE_SQL, type DayNetRow } from "@/db/stats"
import { activeEditor } from "@/editor/activeEditor"
import { updateBook } from "@/features/books/mutations"
import { formatCount, parseCount, tidyCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { formatClock, minutesLeft, STREAK_PREF, streakDays, useGoalsPopover } from "./goals"
import {
  MAX_SPRINT_MINUTES,
  SPRINT_MINUTES,
  sprintEnd,
  sprintWordsLabel,
  sprintWordsParams,
  startSprint,
  stopSprint,
  useSprint,
  type Sprint,
} from "./sprint"
import { useToday } from "./today"
import { useWrite } from "./writeContext"

/*
 * Goals and sprints (DESIGN.md §8 "Writing aids"): today's words against a daily goal, the streak of days it was met,
 * and sprints. The toolbar's Today button opens them below the toolbar; on a phone, the toolbar's menu does.
 */

/** Back into the text where the writer was, e.g. once a sprint starts. */
function backToText() {
  const editor = activeEditor()?.editor
  if (!editor || editor.isDestroyed) return false
  // At once, not a frame later as TipTap's focus command does: by then the panel may be open again, and focus
  // leaving it would close it.
  editor.view.focus()
  return true
}

/** The toolbar's button for Goals and sprints: Today, or on a phone the sprint's clock. One shows at a time. */
const GOALS_TRIGGER = "[data-goals-trigger]"

/** Days running the daily goal was met, or 0 without a goal. */
function useStreak(bookId: string, day: string, goal: number | null) {
  const { data } = useQuery<DayNetRow>(DAILY_NET_SQL, [bookId])
  return streakDays(data, day, goal)
}

/** Whether the streak shows, which the writer can turn off. */
function useShowStreak() {
  const { value, isLoading, setValue } = usePref(STREAK_PREF)
  return { show: value !== "off", isLoading, setShow: (show: boolean) => setValue(show ? "on" : "off") }
}

const listeners = new Set<() => void>()
let ticking: ReturnType<typeof setInterval> | undefined

/** One clock for every sprint countdown, so the toolbar's and the panel's agree; it runs while one shows. */
function subscribeSeconds(listener: () => void) {
  listeners.add(listener)
  ticking ??= setInterval(() => listeners.forEach((notify) => notify()), 250)
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    clearInterval(ticking)
    ticking = undefined
  }
}

/** Seconds left in the sprint, rounded up, so it never shows 0:00 early. */
function useSecondsLeft(sprint: Sprint) {
  const end = sprintEnd(sprint)
  return useSyncExternalStore(subscribeSeconds, () => Math.max(0, Math.ceil((end - Date.now()) / 1000)))
}

/** Words written in the sprint so far: this device's, in its book, less what was there as it began. */
function useSprintWords(sprint: Sprint) {
  const { data } = useQuery<{ net: number }>(DEVICE_NET_SINCE_SQL, sprintWordsParams(sprint))
  return (data[0]?.net ?? sprint.baseline) - sprint.baseline
}

const signed = (value: number) => `${value < 0 ? "−" : "+"}${formatCount(Math.abs(value))}`

/** Goals and sprints, hanging below the Write toolbar, which a GoalsAnchor wraps. */
export function GoalsPopover({ children }: { children: ReactNode }) {
  const open = useGoalsPopover((state) => state.open)
  const content = useRef<HTMLDivElement>(null)
  const clickedAway = useRef(false)
  useEffect(() => () => useGoalsPopover.setState({ open: false, afterClose: null }), [])
  // Reopened before the last close finished fading out, that close never got to put focus anywhere, or forget the
  // click that reopened it, which came from outside the panel.
  useEffect(() => {
    if (open) clickedAway.current = false
  }, [open])
  return (
    <Popover
      open={open}
      onOpenChange={(next) => useGoalsPopover.setState(next ? { open: true, afterClose: null } : { open: false })}
    >
      {children}
      <PopoverContent
        ref={content}
        align="end"
        aria-label="Goals and sprints"
        className="max-h-(--radix-popover-content-available-height) w-80 gap-4 overflow-y-auto p-4"
        onOpenAutoFocus={(event) => {
          // The panel rather than its first field, whose keyboard would cover it on a phone.
          event.preventDefault()
          content.current?.focus()
        }}
        onInteractOutside={(event) => {
          // Not on the button that opens and closes the panel, where focus goes back to anyway. Radix tells of a
          // click only once it lands, so one that opens the panel again as it fades out comes after it's open.
          if (event.target instanceof Element && event.target.closest(GOALS_TRIGGER)) return
          clickedAway.current = true
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // This comes a moment after the panel goes. Opened again since, focus is the open panel's, as is what
          // happens after it closes.
          if (useGoalsPopover.getState().open) return
          const { afterClose } = useGoalsPopover.getState()
          useGoalsPopover.setState({ afterClose: null })
          const away = clickedAway.current
          clickedAway.current = false
          // Focus stays wherever the writer clicked or tapped; else it goes where the opener asked, or to the button.
          if (away || afterClose?.()) return
          document.querySelector<HTMLElement>(GOALS_TRIGGER)?.focus()
        }}
      >
        <GoalsPanel />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Wraps the Write toolbar, so Goals and sprints opens below it, at its end, whether from the toolbar or a menu. The
 * toolbar itself rather than an element inside it: an ancestor's ref is set after its children's, so it wins over the
 * Today button, which is an anchor too until this one mounts.
 */
export const GoalsAnchor = ({ children }: { children: ReactElement }) => (
  <PopoverAnchor asChild>{children}</PopoverAnchor>
)

/** The toolbar's count of today's words, opening Goals and sprints. While a sprint runs, its clock instead. */
export function TodayButton({ className }: { className?: string }) {
  const { book, bookId } = useWrite()
  const today = useToday(bookId)
  const sprint = useSprint((state) => state.sprint)
  const goal = book.daily_goal
  const { show } = useShowStreak()
  const streak = useStreak(bookId, today.day, goal)
  const share = goal ? Math.max(0, today.net) / goal : 0
  const details = [
    `Today: ${formatCount(today.added)} words added, ${formatCount(today.removed)} removed`,
    goal ? `daily goal ${formatCount(goal)}` : "",
    show && streak ? `${streak}-day streak` : "",
  ]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-tour="write-today"
            data-goals-trigger=""
            className={cn("shrink-0 gap-1.5 px-2 text-xs font-normal text-muted-foreground tabular-nums", className)}
          >
            {sprint?.bookId === bookId ? (
              <SprintClock sprint={sprint} />
            ) : (
              <>
                {goal ? <GoalRing share={share} /> : null}
                <span aria-hidden="true">Today {signed(today.net)}</span>
                {show && streak > 0 && (
                  <span aria-hidden="true" className="hidden items-center gap-0.5 lg:inline-flex">
                    <FlameIcon className="size-3.5 text-status-drafting" />
                    {streak}
                  </span>
                )}
                <span className="sr-only">{details.filter(Boolean).join(", ")}</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>Goals and sprints</TooltipContent>
    </Tooltip>
  )
}

/** On a phone: the sprint's clock in the toolbar, while one runs in this book. */
export function SprintChip() {
  const { bookId } = useWrite()
  const sprint = useSprint((state) => state.sprint)
  if (sprint?.bookId !== bookId) return null
  return (
    <PopoverTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        data-goals-trigger=""
        className="shrink-0 gap-1 px-2 text-xs font-normal text-muted-foreground tabular-nums"
      >
        <SprintClock sprint={sprint} />
      </Button>
    </PopoverTrigger>
  )
}

function SprintClock({ sprint }: { sprint: Sprint }) {
  const left = useSecondsLeft(sprint) * 1000
  const words = useSprintWords(sprint)
  return (
    <>
      <TimerIcon aria-hidden="true" className="text-status-drafting" />
      <span aria-hidden="true">{formatClock(left)}</span>
      <span aria-hidden="true" className="hidden lg:inline">
        · {signed(words)}
      </span>
      <span className="sr-only">
        Sprint: {minutesLeft(left)}, {sprintWordsLabel(words)}
      </span>
    </>
  )
}

/** How far today's words are toward the goal, in a ring small enough for the toolbar. */
function GoalRing({ share }: { share: number }) {
  if (share >= 1) return <CircleCheckIcon aria-hidden="true" className="text-status-done" />
  const radius = 6
  const circumference = 2 * Math.PI * radius
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 -rotate-90">
      <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="2.5" className="stroke-surface-2" />
      {share > 0 && (
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeDasharray={`${share * circumference} ${circumference}`}
          className="stroke-status-done"
        />
      )}
    </svg>
  )
}

const HEADING = "text-xs font-semibold tracking-widest text-muted-foreground uppercase"

function GoalsPanel() {
  const { book, bookId } = useWrite()
  const today = useToday(bookId)
  const goal = book.daily_goal
  const id = useId()
  return (
    <>
      <section aria-labelledby={`${id}-today`} className="flex flex-col gap-1.5">
        <h2 id={`${id}-today`} className={HEADING}>
          Today
        </h2>
        <p className="font-heading text-3xl leading-none font-semibold text-ink tabular-nums">
          {signed(today.net)} <span className="font-sans text-sm font-normal text-muted-foreground">words</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCount(today.added)} added · {formatCount(today.removed)} cut
        </p>
        {goal ? (
          <>
            <ProgressBar value={Math.max(0, today.net)} max={goal} label="Daily goal" className="mt-1.5" />
            <p className="text-xs text-muted-foreground tabular-nums">
              {today.net >= goal ? "Today's goal is met." : `${formatCount(goal - today.net)} to go`}
            </p>
          </>
        ) : null}
      </section>
      <DailyGoalField key={bookId} goal={goal} />
      {goal ? <Streak goal={goal} day={today.day} /> : null}
      <Separator />
      <SprintSection />
    </>
  )
}

function DailyGoalField({ goal }: { goal: number | null }) {
  const { db, bookId } = useWrite()
  const [text, setText] = useState(goal ? formatCount(goal) : "")
  const id = useId()
  const invalid = !!text.trim() && parseCount(text) === null
  const change = (value: string) => {
    setText(value)
    const next = parseCount(value)
    if (value.trim() && next === null) return
    if (next !== goal) void attempt("daily goal", updateBook(db, bookId, { daily_goal: next }))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Daily goal</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="None"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => change(event.target.value)}
          onBlur={() => setText((value) => tidyCount(value))}
          className="w-28"
        />
        <span className="text-sm text-muted-foreground">words a day</span>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {invalid ? "Type a number, like 500." : "Words added less words cut, in this book. Empty for no goal."}
      </p>
    </div>
  )
}

function Streak({ goal, day }: { goal: number; day: string }) {
  const { bookId } = useWrite()
  const streak = useStreak(bookId, day, goal)
  const { show, isLoading, setShow } = useShowStreak()
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      {show && !isLoading && (
        <p className="flex items-center gap-1.5 text-sm text-ink">
          <FlameIcon
            aria-hidden="true"
            className={cn("size-4", streak ? "text-status-drafting" : "text-muted-foreground")}
          />
          {streak
            ? `Goal met ${streak} ${streak === 1 ? "day" : "days"} running`
            : "Meet today's goal to start a streak."}
        </p>
      )}
      <div className="flex items-center gap-2 pointer-coarse:min-h-11">
        <Checkbox
          id={id}
          checked={show}
          disabled={isLoading}
          onCheckedChange={(checked) => void setShow(checked === true)}
        />
        <Label htmlFor={id} className="font-normal">
          Show my streak
        </Label>
      </div>
    </div>
  )
}

function SprintSection() {
  const db = usePowerSync()
  const { bookId } = useWrite()
  const sprint = useSprint((state) => state.sprint)
  const [custom, setCustom] = useState("")
  const id = useId()
  const customMinutes = parseCount(custom)

  const start = (minutes: number) => {
    void attempt("sprint", startSprint(db, bookId, Math.min(minutes, MAX_SPRINT_MINUTES)))
    useGoalsPopover.setState({ open: false, afterClose: backToText })
  }
  const stop = () => {
    stopSprint()
    // The Stop button goes, and focus with it.
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-sprint-start]")?.focus())
  }

  return (
    <section aria-labelledby={`${id}-sprint`} className="flex flex-col gap-2">
      <h2 id={`${id}-sprint`} className={HEADING}>
        Sprint
      </h2>
      {sprint ? (
        <>
          {sprint.bookId === bookId ? (
            <RunningSprint sprint={sprint} />
          ) : (
            <p className="text-sm text-ink">A sprint is running in another book.</p>
          )}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={stop}>
              Stop sprint
            </Button>
            <p className="text-xs text-muted-foreground">Stopped early, it isn't counted.</p>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Write against the clock, and see how many words you add.</p>
          <div className="grid grid-cols-3 gap-2">
            {SPRINT_MINUTES.map((minutes) => (
              <Button
                key={minutes}
                variant="outline"
                size="sm"
                data-sprint-start={minutes}
                aria-label={`Start a ${minutes}-minute sprint`}
                onClick={() => start(minutes)}
              >
                {minutes} min
              </Button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (customMinutes) start(customMinutes)
            }}
          >
            <Label htmlFor={`${id}-minutes`} className="font-normal text-muted-foreground">
              Or
            </Label>
            <Input
              id={`${id}-minutes`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="10"
              value={custom}
              aria-label="Sprint length in minutes"
              onChange={(event) => setCustom(event.target.value)}
              className="w-16"
            />
            <span className="text-sm text-muted-foreground">minutes</span>
            <Button type="submit" variant="secondary" size="sm" disabled={!customMinutes} className="ml-auto">
              Start
            </Button>
          </form>
        </>
      )}
    </section>
  )
}

function RunningSprint({ sprint }: { sprint: Sprint }) {
  const left = useSecondsLeft(sprint) * 1000
  const words = useSprintWords(sprint)
  return (
    <div className="flex flex-col gap-1">
      <p className="font-heading text-3xl leading-none font-semibold text-ink tabular-nums">
        <span aria-hidden="true">{formatClock(left)}</span>
        <span className="sr-only">{minutesLeft(left)}</span>
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {sprintWordsLabel(words)} so far, in a {sprint.minutes}-minute sprint
      </p>
    </div>
  )
}
