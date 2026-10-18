import { toast } from "sonner"
import { create } from "zustand"
import { announce, reportError } from "@/app/feedback"
import { DEVICE_NET_SINCE_SQL, deviceId, localDay, recordSprint } from "@/db/stats"
import type { Db } from "@/db/tx"
import { saveWordCounts } from "@/editor/sceneDocs"
import { formatCount } from "@/lib/numbers"

/*
 * Writing sprints (DESIGN.md §8 "Writing aids"): a set time to write in, counting the words it adds to the book. One
 * at a time, kept in localStorage so that a reload or another tab carries on with it. One that ran out while the app
 * was closed is counted when it next opens.
 */

export interface Sprint {
  bookId: string
  /** When it began, in ms since the epoch. */
  startedAt: number
  minutes: number
  /** The day it began, and this device's net words in the book from that day on, as it began. */
  startDay: string
  baseline: number
}

export const SPRINT_MINUTES = [15, 25, 45] as const
/** The longest a sprint of the writer's own length can be. */
export const MAX_SPRINT_MINUTES = 240

const STORAGE_KEY = "bbb.sprint"
const LOCK = "bbb.sprint"

export const sprintEnd = (sprint: Sprint) => sprint.startedAt + sprint.minutes * 60_000

const isSprint = (value: unknown): value is Sprint => {
  if (typeof value !== "object" || value === null) return false
  const sprint = value as Record<string, unknown>
  return (
    typeof sprint.bookId === "string" &&
    typeof sprint.startedAt === "number" &&
    typeof sprint.minutes === "number" &&
    typeof sprint.startDay === "string" &&
    typeof sprint.baseline === "number"
  )
}

/** The stored sprint; undefined when localStorage can't be read, as in some private windows. */
function stored(): Sprint | null | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    return isSprint(value) ? value : null
  } catch {
    return undefined
  }
}

export const useSprint = create<{ sprint: Sprint | null }>(() => ({ sprint: stored() ?? null }))

function save(sprint: Sprint | null) {
  try {
    if (sprint) localStorage.setItem(STORAGE_KEY, JSON.stringify(sprint))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Without storage the sprint lasts as long as the tab.
  }
  useSprint.setState({ sprint })
}

/** DEVICE_NET_SINCE_SQL's params for the words a sprint counts. */
export const sprintWordsParams = (sprint: Pick<Sprint, "bookId" | "startDay">) => [
  sprint.bookId,
  sprint.startDay,
  `${deviceId()}:%`,
]

async function netSince(db: Db, sprint: Pick<Sprint, "bookId" | "startDay">) {
  const row = await db.get<{ net: number }>(DEVICE_NET_SINCE_SQL, sprintWordsParams(sprint))
  return row.net
}

export async function startSprint(db: Db, bookId: string, minutes: number) {
  // So every word written before it is in the baseline, and none of them count.
  await saveWordCounts()
  const startDay = localDay()
  const baseline = await netSince(db, { bookId, startDay })
  save({ bookId, startedAt: Date.now(), minutes, startDay, baseline })
  announce(`Sprint started: ${minutes} minutes`)
}

/** Stops the sprint before its time is up. It isn't counted. */
export function stopSprint() {
  save(null)
  announce("Sprint stopped")
}

/** "312 words", or "40 words cut" for a sprint spent cutting. */
export function sprintWordsLabel(words: number) {
  const count = Math.abs(words)
  return `${formatCount(count)} ${count === 1 ? "word" : "words"}${words < 0 ? " cut" : ""}`
}

/** Counts the sprint in the day's stats, once, though every open tab's timer goes off. */
async function finish(db: Db, sprint: Sprint) {
  const run = async () => {
    const current = stored()
    const now = current === undefined ? useSprint.getState().sprint : current
    if (now?.startedAt !== sprint.startedAt || now.bookId !== sprint.bookId) return
    await saveWordCounts()
    const words = (await netSince(db, sprint)) - sprint.baseline
    await recordSprint(db, sprint.bookId, deviceId(), sprint.startDay)
    save(null)
    toast(`Sprint done: ${sprintWordsLabel(words)} in ${sprint.minutes} minutes`)
  }
  await (navigator.locks ? navigator.locks.request(LOCK, run) : run())
}

/** Keeps time for the sprint, following other tabs as they start and stop theirs. Returns a function that stops it. */
export function startSprintTimer(db: Db): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    const { sprint } = useSprint.getState()
    if (!sprint) return
    timer = setTimeout(
      () => void finish(db, sprint).catch((error: unknown) => reportError("sprint", error)),
      Math.max(0, sprintEnd(sprint) - Date.now()),
    )
  }
  const unsubscribe = useSprint.subscribe(schedule)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) useSprint.setState({ sprint: stored() ?? null })
  }
  window.addEventListener("storage", onStorage)
  schedule()
  return () => {
    clearTimeout(timer)
    unsubscribe()
    window.removeEventListener("storage", onStorage)
  }
}
