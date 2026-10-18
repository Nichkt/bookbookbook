import { useQuery } from "@powersync/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { DAY_NET_SQL, DAY_STATS_SQL, localDay, type DayStatsRow } from "@/db/stats"
import { formatCount } from "@/lib/numbers"

/** The writer's calendar day, turning over at midnight while the page is open. */
export function useDay() {
  const [day, setDay] = useState(localDay)
  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(() => setDay(localDay()), midnight.getTime() - now.getTime() + 1000)
    return () => clearTimeout(timer)
  }, [day])
  return day
}

export interface Today extends DayStatsRow {
  day: string
  /** Words added less words cut: what the daily goal counts. */
  net: number
}

/** The book's words today, over every device. */
export function useToday(bookId: string): Today {
  const day = useDay()
  const { data } = useQuery<DayStatsRow>(DAY_STATS_SQL, [bookId, day])
  const { added, removed } = data[0] ?? { added: 0, removed: 0 }
  return { day, added, removed, net: added - removed }
}

const celebrated = new Set<string>()

/**
 * A toast as today's words reach the daily goal: once a day for each book, and only for words written while the page
 * is open, so it doesn't greet the writer with a goal they met this morning.
 */
export function useGoalCelebration(bookId: string, goal: number | null) {
  const day = useDay()
  const key = `${bookId}:${day}`
  const { data } = useQuery<{ key: string; net: number }>(DAY_NET_SQL, [key, bookId, day])
  const rowKey = data.at(0)?.key
  const net = data.at(0)?.net
  const before = useRef<{ key: string; net: number } | null>(null)
  useEffect(() => {
    if (rowKey === undefined || net === undefined) return
    const previous = before.current
    before.current = { key: rowKey, net }
    // Rows from before the book or the day changed carry the old key.
    if (!goal || previous?.key !== rowKey || previous.net >= goal || net < goal || celebrated.has(rowKey)) return
    celebrated.add(rowKey)
    toast(`Daily goal met: ${formatCount(net)} words today`)
  }, [goal, rowKey, net])
}
