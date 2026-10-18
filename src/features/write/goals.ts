import { create } from "zustand"
import { localDay, type DayNetRow } from "@/db/stats"

/*
 * Daily goals and streaks (DESIGN.md §8 "Writing aids"). A day's words are net, what was added less what was cut, as
 * the toolbar's Today count shows them: a day spent cutting can fall short of the goal, and that's fair.
 */

interface GoalsPopoverState {
  open: boolean
  /** Puts focus somewhere once Goals and sprints closes, rather than on its toolbar button; true if it did. */
  afterClose: (() => boolean) | null
}

/** Per device: "off" hides the streak. */
export const STREAK_PREF = "write.streak"

export const useGoalsPopover = create<GoalsPopoverState>(() => ({ open: false, afterClose: null }))

/** Opens Goals and sprints from a menu, putting focus back on `returnTo` when it closes. */
export const openGoals = (returnTo: HTMLElement | null) =>
  useGoalsPopover.setState({
    open: true,
    afterClose: () => {
      if (!returnTo?.isConnected) return false
      returnTo.focus()
      return true
    },
  })

/** The day before a YYYY-MM-DD day, on the writer's calendar. */
export function dayBefore(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  return localDay(new Date(year, month - 1, date - 1))
}

/**
 * How many days running the goal was met. Today counts once it's met; until then the streak runs to yesterday, so it
 * isn't lost before the day is out. Past days are held to the goal as it is now.
 */
export function streakDays(days: readonly DayNetRow[], today: string, goal: number | null): number {
  if (!goal || goal <= 0) return 0
  const net = new Map(days.map((row) => [row.date, row.net]))
  const met = (day: string) => (net.get(day) ?? 0) >= goal
  let day = met(today) ? today : dayBefore(today)
  let streak = 0
  while (met(day)) {
    streak += 1
    day = dayBefore(day)
  }
  return streak
}

/** A countdown as minutes and seconds, "12:05", or past an hour "1:02:05". Rounds up, so it never shows 0:00 early. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** "12 minutes left", for screen readers, which would read a ticking clock out every second. */
export function minutesLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} left`
}
