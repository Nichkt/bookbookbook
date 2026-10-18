import { usePowerSync } from "@powersync/react"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type ReactNode,
} from "react"
import { KEEP_PER_BOOK } from "@/backup/folder"
import { daysBetween, lastBackupLabel, lastBackupSentence, parseRecord, recordKey } from "@/backup/record"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePref } from "@/db/prefs"
import type { BookListRow } from "@/db/queries"
import { backUpBook, resumeFolderBackups, startFolderBackups, stopFolderBackups } from "./commands"
import { useFolder, whyStopped } from "./useFolder"

/*
 * Backups, from the book menu (DESIGN.md §12): the open book's last backup, folder backups, and whether the browser
 * has agreed to keep the app's data.
 */

const HEADING = "text-xs font-semibold tracking-wider text-muted-foreground uppercase"

/** Runs one piece of work at a time. Busy buttons stay focusable, so focus isn't lost while they work. */
function useOneAtATime() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (action: string, work: () => Promise<void>) => {
    if (busy) return
    setBusy(action)
    await work()
    setBusy(null)
  }
  return { busy, run }
}

function Section({ heading, children, ...props }: { heading: string } & ComponentProps<"section">) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid gap-2" {...props}>
      <h3 id={id} className={HEADING}>
        {heading}
      </h3>
      {children}
    </section>
  )
}

/**
 * For a section whose buttons come and go with the work they do. When the one with focus goes, focus moves to the
 * section's first button, or failing that to what's marked `data-takes-focus`, rather than to the dialog as a whole.
 */
function useKeepFocus() {
  const ref = useRef<HTMLElement>(null)
  const focused = useRef<HTMLElement | null>(null)
  // Before the dialog's focus trap sees focus fall to the page.
  useLayoutEffect(() => {
    const gone = focused.current
    if (!gone || gone.isConnected) return
    focused.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    ref.current?.querySelector<HTMLElement>("button, [data-takes-focus]")?.focus()
  })
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    focused.current = event.target
  }
  return { ref, onFocus }
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

/** "today at 14:32", "yesterday at 14:32", "3 March at 14:32". */
function when(iso: string, now: Date, locale?: string): string {
  const date = new Date(iso)
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date)
  const days = daysBetween(date, now)
  if (days <= 0) return `today at ${time}`
  if (days === 1) return `yesterday at ${time}`
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  return `${new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year }).format(date)} at ${time}`
}

export function BackupsDialog({ book }: { book: BookListRow | undefined }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Backups</DialogTitle>
        <DialogDescription>
          Your books are kept in this browser. A backup is a copy kept somewhere else, to bring back with Restore from
          backup if the browser ever loses them.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        {book && <BookBackup book={book} />}
        <FolderBackups />
        <BrowserStorage />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Done
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}

function BookBackup({ book }: { book: BookListRow }) {
  const db = usePowerSync()
  const { value, isLoading } = usePref(recordKey(book.id))
  const record = useMemo(() => parseRecord(value), [value])
  const [now] = useState(() => new Date())
  const { busy, run } = useOneAtATime()
  const title = book.title?.trim() || "Untitled book"
  const last = record?.last ?? null
  const changed = last !== null && record?.changedAt ? " It has changed since." : ""
  return (
    <Section heading="This book">
      <p>
        <span className="font-medium text-ink">{title}</span>
        <br />
        <span className="text-muted-foreground">{isLoading ? "\u00a0" : lastBackupSentence(last, now) + changed}</span>
      </p>
      <Actions>
        <Button
          size="sm"
          aria-disabled={busy !== null}
          className="aria-disabled:opacity-50"
          onClick={() => void run("download", () => backUpBook(db, book.id))}
        >
          {busy ? "Backing up…" : "Back up now"}
        </Button>
      </Actions>
    </Section>
  )
}

function FolderBackups() {
  const db = usePowerSync()
  const folder = useFolder()
  const { busy, run } = useOneAtATime()
  const keepFocus = useKeepFocus()
  const [now] = useState(() => new Date())

  if (!folder.supported) {
    return (
      <Section heading="Folder backups">
        <p className="text-muted-foreground">
          This browser can’t back up to a folder; Chrome and Edge on a computer can. Here, use Back up now, and keep
          the file somewhere safe, such as a cloud drive.
        </p>
      </Section>
    )
  }
  if (folder.loading) return <Section heading="Folder backups">{null}</Section>

  // Keyed, so a button that stays as the state changes keeps focus, and only its label changes.
  const button = (action: string, label: string, work: () => Promise<void>, variant: "default" | "outline" = "outline") => (
    <Button
      key={action}
      size="sm"
      variant={variant}
      aria-disabled={busy !== null}
      className="aria-disabled:opacity-50"
      onClick={() => void run(action, work)}
    >
      {busy === action && action !== "stop" ? "Backing up…" : label}
    </Button>
  )
  const allow = (label: string) => button("allow", label, () => resumeFolderBackups(db), "default")
  const choose = (label: string, variant?: "default") => button("choose", label, () => startFolderBackups(db), variant)
  const stop = button("stop", "Stop", () => stopFolderBackups(db))
  const name = <span className="font-medium text-ink">“{folder.pref?.name ?? "the folder"}”</span>

  let about: ReactNode
  let actions: ReactNode[]
  switch (folder.state) {
    case "off":
      about = (
        <p className="text-muted-foreground">
          Choose a folder, ideally one a cloud drive such as iCloud Drive, Google Drive, OneDrive or Dropbox keeps, and
          every book is backed up there whenever it changes. The newest {KEEP_PER_BOOK} backups of each book are kept.
        </p>
      )
      actions = [choose("Choose a folder…")]
      break
    case "on": {
      const lastRun = folder.pref?.lastRun
      about = (
        <p>
          Every book is backed up to {name} within the hour when it changes, and as you leave the app.
          <br />
          <span className="text-muted-foreground">
            {folder.running ? "Backing up…" : lastRun ? `Up to date as of ${when(lastRun, now)}.` : "\u00a0"}
          </span>
        </p>
      )
      actions = [choose("Change folder…"), stop]
      break
    }
    case "paused":
      about = (
        <p>
          Backups to {name} are paused: the browser needs your permission to write there again.
          <br />
          <span className="text-muted-foreground">
            If the browser offers “Allow on every visit”, choose it to keep them from pausing.
          </span>
        </p>
      )
      actions = [allow("Allow"), choose("Change folder…"), stop]
      break
    case "stopped": {
      const message = folder.hasHandle && folder.pref?.error?.kind === "failed" ? folder.pref.error.message : undefined
      about = (
        <p>
          Backups to {name} have stopped: {whyStopped(folder)}.
          {message && (
            <>
              <br />
              <span className="text-muted-foreground">The browser said: {message}</span>
            </>
          )}
        </p>
      )
      actions = folder.hasHandle
        ? [allow("Try again"), choose("Choose a folder…"), stop]
        : [choose("Choose a folder…", "default"), stop]
      break
    }
  }

  return (
    <Section heading="Folder backups" {...keepFocus}>
      {about}
      <Actions>{actions}</Actions>
    </Section>
  )
}

const formatSize = (bytes: number, locale?: string) => {
  const unit = bytes >= 1e9 ? "gigabyte" : bytes >= 1e6 ? "megabyte" : "kilobyte"
  const value = bytes / (bytes >= 1e9 ? 1e9 : bytes >= 1e6 ? 1e6 : 1e3)
  return new Intl.NumberFormat(locale, { style: "unit", unit, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)
}

interface StorageState {
  persisted: boolean
  usage: number | null
  /** Set once the writer has asked, and the browser said no. */
  refused: boolean
}

function BrowserStorage() {
  const [storage, setStorage] = useState<StorageState | null>(null)
  const { busy, run } = useOneAtATime()
  const keepFocus = useKeepFocus()

  useEffect(() => {
    let current = true
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined)
      if (current) setStorage({ persisted, usage: estimate?.usage ?? null, refused: false })
    })()
    return () => {
      current = false
    }
  }, [])

  if (!storage) return <Section heading="This browser">{null}</Section>

  const ask = async () => {
    const persisted = (await navigator.storage?.persist?.().catch(() => false)) ?? false
    setStorage((current) => current && { ...current, persisted, refused: !persisted })
  }
  const usage = storage.usage === null ? "" : ` Your books and the app take up ${formatSize(storage.usage)}.`

  return (
    <Section heading="This browser" {...keepFocus}>
      {storage.persisted ? (
        // Takes focus from the button that asked, which goes once the browser agrees.
        <p data-takes-focus tabIndex={-1} className="text-muted-foreground outline-none">
          The browser has agreed to keep your books unless you clear its data.{usage}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            The browser may clear your books to free up space, or in Safari after a week away, so keep backups.{usage}
          </p>
          {storage.refused && (
            <p role="status" className="text-muted-foreground">
              The browser said no for now. Installing the app, or bookmarking it, can change its mind.
            </p>
          )}
          <Actions>
            <Button
              size="sm"
              variant="outline"
              aria-disabled={busy !== null}
              className="aria-disabled:opacity-50"
              onClick={() => void run("ask", ask)}
            >
              {storage.refused ? "Ask again" : "Ask the browser to keep them"}
            </Button>
          </Actions>
        </>
      )}
    </Section>
  )
}

/** The book's last backup, short, for the book menu: "Today", "12 days ago", "Never". */
export function LastBackupLabel({ bookId }: { bookId: string }) {
  const { value, isLoading } = usePref(recordKey(bookId))
  // As of the menu opening, which mounts this afresh.
  const [now] = useState(() => new Date())
  const label = useMemo(() => lastBackupLabel(parseRecord(value)?.last ?? null, now), [value, now])
  if (isLoading) return null
  return (
    <span className="ml-auto text-xs text-muted-foreground">
      <span className="sr-only">Last backup: </span>
      {label}
    </span>
  )
}
