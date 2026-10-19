import { ExternalLinkIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useId } from "react"
import {
  APP_VERSION,
  checkForUpdate,
  downloadedText,
  installUpdate,
  RELEASES_URL,
  shouldCheck,
  useUpdates,
} from "@/app/updates"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { setBookDialogBusy } from "@/features/books/dialogStore"
import { actionOf, hintOf, statusOf } from "./steps"

/*
 * Updates, in the desktop app, from Check for updates on the home screen, in the book menu or the palette (DESIGN.md
 * §11). It looks on GitHub for a new version as it opens, and downloads and installs one when the writer says.
 */

export function UpdatesDialog() {
  const state = useUpdates()
  const action = actionOf(state)
  const installing = state.step === "installing"
  const hint = hintOf(state)

  useEffect(() => {
    if (shouldCheck(useUpdates.getState())) void checkForUpdate()
  }, [])

  // Installing ends with the app closing, so the dialog stays open till then, or till something goes wrong.
  useEffect(() => {
    if (!installing) return
    setBookDialogBusy(true)
    return () => setBookDialogBusy(false)
  }, [installing])

  const run = () => {
    if (action.does === "check") void checkForUpdate()
    else if (action.does === "install") void installUpdate()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Updates</DialogTitle>
        <DialogDescription>You have bookbookbook {APP_VERSION}.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 text-sm">
        <p role="status" className="flex items-start gap-2">
          {action.does === null && (
            <LoaderCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          )}
          <span>{statusOf(state)}</span>
        </p>
        {state.step === "failed" && (
          <p className="text-xs break-words text-muted-foreground">The error was: {state.message}</p>
        )}
        {state.step === "downloading" && <DownloadBar received={state.received} total={state.total} />}
        {hint && <p className="text-muted-foreground">{hint}</p>}
        {"notes" in state && state.notes && <Notes version={state.version} notes={state.notes} />}
      </div>
      <DialogFooter className="sm:items-center sm:justify-between">
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1 self-center rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
        >
          All versions on GitHub
          <ExternalLinkIcon className="size-3" aria-hidden="true" />
          <span className="sr-only">(opens in your browser)</span>
        </a>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={installing}>
              Close
            </Button>
          </DialogClose>
          {/* One button whose job changes as the steps go by, so focus stays put. Busy, it stays focusable. */}
          <Button
            type="button"
            variant={action.primary ? "default" : "outline"}
            aria-disabled={action.does === null}
            className="aria-disabled:opacity-50"
            autoFocus
            onClick={run}
          >
            {action.label}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function DownloadBar({ received, total }: { received: number; total: number | null }) {
  const text = downloadedText(received, total)
  const share = total ? Math.min(1, received / total) : null
  return (
    <div className="grid gap-1">
      <div
        role="progressbar"
        aria-label="Downloaded"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={share === null ? undefined : Math.round(share * 100)}
        aria-valuetext={text}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        {share === null ? (
          <div className="h-full w-full animate-pulse rounded-full bg-primary/40 motion-reduce:animate-none" />
        ) : (
          <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
        )}
      </div>
      <p aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
        {text}
      </p>
    </div>
  )
}

/** What's new, as the release on GitHub says. */
function Notes({ version, notes }: { version: string; notes: string }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <h3 id={id} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        What’s new in {version}
      </h3>
      {/* Focusable, so the keyboard can scroll it. */}
      <div
        role="region"
        aria-labelledby={id}
        tabIndex={0}
        className="max-h-48 overflow-y-auto rounded-md border bg-surface-2/50 p-3 whitespace-pre-line outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {notes}
      </div>
    </div>
  )
}
