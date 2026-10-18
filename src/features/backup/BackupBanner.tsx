import { usePowerSync } from "@powersync/react"
import { ArchiveIcon, FolderClockIcon, FolderXIcon } from "lucide-react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { Reminder } from "@/backup/record"
import { Button } from "@/components/ui/button"
import type { BookListRow } from "@/db/queries"
import { focusPast } from "@/lib/focus"
import { backUpBook, resumeFolderBackups, startFolderBackups } from "./commands"
import { useBackupReminder } from "./useBackupReminder"
import { useFolder, whyStopped, type Folder } from "./useFolder"

const ago = (days: number) => (days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`)

function message(reminder: Reminder, title: string, folder: Folder): string {
  const name = folder.pref?.name ?? "the folder"
  switch (reminder.kind) {
    case "never":
      return `“${title}” has never been backed up. Its only copy is in this browser.`
    case "stale":
      return `“${title}” was last backed up ${ago(reminder.days)}, and has changed since.`
    case "paused":
      return `Backups to “${name}” are paused: the browser needs your permission to write there again.`
    case "stopped":
      return `Backups to “${name}” have stopped: ${whyStopped(folder)}.`
  }
}

const ICONS = { never: ArchiveIcon, stale: ArchiveIcon, paused: FolderClockIcon, stopped: FolderXIcon }

/**
 * The backup reminder (DESIGN.md §12), atop the open book's screens: a book unbacked-up for a week of changes, or
 * folder backups that need the writer. Keyed by book, so each book's reminder starts afresh.
 */
export function BackupBanner({ book }: { book: BookListRow }) {
  const { reminder, snooze } = useBackupReminder(book.id)
  return reminder ? <ReminderStrip book={book} reminder={reminder} snooze={snooze} /> : null
}

type Action = "download" | "folder" | "allow"

function ReminderStrip({ book, reminder, snooze }: { book: BookListRow; reminder: Reminder; snooze: () => void }) {
  const db = usePowerSync()
  const folder = useFolder()
  const section = useRef<HTMLElement>(null)
  const focused = useRef<HTMLElement | null>(null)
  // While a button works, the strip stays as it was when the button was chosen, so neither the button nor focus
  // goes from under the writer: folder backups come on, say, before they've written the book's backup.
  const [busy, setBusy] = useState<{ action: Action; reminder: Reminder; folder: Folder } | null>(null)
  const shown = busy ?? { reminder, folder }
  const title = book.title?.trim() || "Untitled book"
  const Icon = ICONS[shown.reminder.kind]

  // A button that goes all the same passes focus to the strip's first, rather than let it drop to the top of the page.
  useLayoutEffect(() => {
    const gone = focused.current
    if (!gone || gone.isConnected) return
    focused.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    section.current?.querySelector<HTMLElement>("button")?.focus()
  })

  useLayoutEffect(() => {
    const element = section.current
    return () => {
      if (element?.contains(document.activeElement)) focusPast(element)
    }
  }, [])

  const run = async (action: Action, work: () => Promise<void>) => {
    if (busy) return
    setBusy({ action, reminder, folder })
    await work()
    setBusy(null)
  }

  // Busy buttons stay focusable, so focus isn't lost while they work. Keyed, so one that stays as the reminder
  // changes keeps focus.
  const button = (action: Action, label: string, work: () => Promise<void>, variant: "default" | "outline") => (
    <Button
      key={action}
      size="sm"
      variant={variant}
      aria-disabled={busy !== null}
      className="aria-disabled:opacity-50"
      onClick={() => void run(action, work)}
    >
      {busy?.action === action ? "Backing up…" : label}
    </Button>
  )
  const actions: ReactNode[] = []
  if (shown.reminder.kind === "never" || shown.reminder.kind === "stale") {
    actions.push(button("download", "Back up now", () => backUpBook(db, book.id), "default"))
    if (shown.folder.supported && shown.folder.state === "off") {
      actions.push(button("folder", "Back up to a folder…", () => startFolderBackups(db), "outline"))
    }
  } else if (shown.reminder.kind === "paused") {
    actions.push(button("allow", "Allow", () => resumeFolderBackups(db), "default"))
  } else {
    actions.push(button("folder", "Choose a folder…", () => startFolderBackups(db), "default"))
  }

  return (
    <section
      ref={section}
      aria-label="Backup reminder"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-accent-soft px-4 py-2 text-sm text-ink"
      onFocus={(event) => {
        focused.current = event.target
      }}
      onBlur={(event) => {
        const left = event.target
        // Moved on within the page, rather than gone with its button or with the page into the background.
        queueMicrotask(() => {
          if (focused.current === left && left.isConnected && document.activeElement !== left) focused.current = null
        })
      }}
    >
      <p className="flex min-w-0 flex-1 basis-80 items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{message(shown.reminder, title, shown.folder)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <Button
          size="sm"
          variant="ghost"
          aria-disabled={busy !== null}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (!busy) snooze()
          }}
        >
          Not now
        </Button>
      </div>
    </section>
  )
}
