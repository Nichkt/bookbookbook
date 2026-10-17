import { useCallback, useEffect, useMemo, useState } from "react"
import { parseRecord, recordKey, reminderFor, snoozeKey, snoozeUntil, type Reminder } from "@/backup/record"
import { usePref } from "@/db/prefs"
import { useFolder } from "./useFolder"

const isHidden = () => document.visibilityState === "hidden"
/** A spell in the tab or away from it, `settled` once the reminder has been decided on for it. */
const newVisit = (settled: boolean) => ({ hidden: isHidden(), now: new Date(), settled })

/**
 * The open book's backup reminder, when it's due (DESIGN.md §12). It comes only at calm moments: as the book opens,
 * or while the writer is away from the tab, so it's there when they come back rather than appearing mid-sentence.
 * It goes as soon as it's dealt with. Mount it afresh for each book.
 */
export function useBackupReminder(bookId: string): { reminder: Reminder | null; snooze: () => void } {
  const record = usePref(recordKey(bookId))
  const snoozed = usePref(snoozeKey(bookId))
  const folder = useFolder()
  // The first spell is decided on as the book opens, once all is read; a later one, as the writer comes back.
  const [visit, setVisit] = useState(() => newVisit(true))
  useEffect(() => {
    const onVisibilityChange = () => setVisit(newVisit(false))
    // On the window, as the event sets out, so a spell always begins before the scheduler, listening on the document,
    // looks at the folder again for it. Without folder backups, it looks at once.
    window.addEventListener("visibilitychange", onVisibilityChange, true)
    return () => window.removeEventListener("visibilitychange", onVisibilityChange, true)
  }, [])

  const loading = record.isLoading || snoozed.isLoading || folder.loading
  const parsed = useMemo(() => parseRecord(record.value), [record.value])
  const live = loading ? null : reminderFor(parsed, folder.state, snoozed.value, visit.now)
  // Back, and the folder looked at again since: the browser may have taken back its permission to write there.
  const back = !visit.hidden && !visit.settled && folder.checkedAt >= visit.now.getTime()
  // Whether the reminder may show. Decided once all is read, again while the writer is away, and once more when
  // they're back and the folder has been looked at again. Otherwise it may go but not come.
  const [allowed, setAllowed] = useState<boolean | null>(null)
  if (!loading) {
    const next = allowed === null || visit.hidden || back ? live !== null : allowed && live !== null
    if (next !== allowed) setAllowed(next)
    if (back) setVisit({ ...visit, settled: true })
  }
  const reminder = allowed ? live : null

  const { setValue } = snoozed
  const snooze = useCallback(() => {
    if (reminder) void setValue(snoozeUntil(reminder, new Date()))
  }, [reminder, setValue])
  return { reminder, snooze }
}
