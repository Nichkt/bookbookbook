import { CircleCheckIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { retryUnsavedText } from "@/editor/sceneDocs"
import { openBookDialog } from "@/features/books/dialogStore"
import { shortcutLabel } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { desktop } from "./desktop"
import { flushDrafts, useSaveState } from "./saveStatus"
import { REDO_KEYS, UNDO_KEYS } from "./undoShortcuts"

/** Saving shows once it has taken this long, so quick saves don't make it flicker. */
const SHOW_SAVING_MS = 400
/** Once it shows, it stays up at least this long. */
const HOLD_SAVING_MS = 600

type Shown = "saved" | "saving" | "failed"

const LABELS: Record<Shown, string> = { saved: "Saved", saving: "Saving…", failed: "Not saved" }
const ICONS = { saved: CircleCheckIcon, saving: LoaderCircleIcon, failed: TriangleAlertIcon }
const WHERE = desktop ? "on this computer" : "in this browser"

function useShown(): Shown {
  const busy = useSaveState((state) => state.writing > 0 || state.waiting > 0)
  const failed = useSaveState((state) => state.failed.length > 0)
  const [saving, setSaving] = useState(false)
  const shownAt = useRef(0)
  useEffect(() => {
    const timer = busy
      ? setTimeout(() => {
          shownAt.current = Date.now()
          setSaving(true)
        }, SHOW_SAVING_MS)
      : setTimeout(() => setSaving(false), Math.max(0, shownAt.current + HOLD_SAVING_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [busy])
  if (failed) return "failed"
  return saving ? "saving" : "saved"
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * Whether the book's work is saved (DESIGN.md §12), in the header: everything saves by itself as it's made, so this
 * only says that it has, or, should a save fail, that it hasn't. Phones show it only then, for room.
 */
export function SaveIndicator() {
  const shown = useShown()
  const savedAt = useSaveState((state) => state.savedAt)
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const Icon = ICONS[shown]

  const retry = async () => {
    setRetrying(true)
    try {
      await Promise.allSettled([flushDrafts(), retryUnsavedText()])
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="sm"
          data-tour="save-status"
          data-save-status={shown}
          title="Is my work saved?"
          className={cn(
            "text-ink-2",
            shown === "failed" ? "text-destructive hover:text-destructive" : "hidden sm:inline-flex",
          )}
        >
          <Icon aria-hidden="true" className={cn(shown === "saving" && "animate-spin motion-reduce:animate-none")} />
          <span className={cn(shown !== "failed" && "sr-only lg:not-sr-only")}>{LABELS[shown]}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-80">
        <PopoverHeader>
          <PopoverTitle id={titleId}>{shown === "saved" ? "All saved" : LABELS[shown]}</PopoverTitle>
          {shown === "failed" ? (
            <PopoverDescription id={descriptionId}>
              Something went wrong, so your latest changes aren't saved yet. Keep bookbookbook open while you try
              again. If it keeps happening, back up your books.
            </PopoverDescription>
          ) : (
            <PopoverDescription id={descriptionId}>
              bookbookbook saves your work by itself as you go, {WHERE}, so there's no need to save.
              {shown === "saved" && savedAt !== null && ` Last saved at ${timeOf(savedAt)}.`}
            </PopoverDescription>
          )}
        </PopoverHeader>
        <p className="text-muted-foreground">
          Changed your mind? Undo ({shortcutLabel(UNDO_KEYS)}) takes back your last change, wherever you made it, and
          Redo ({shortcutLabel(REDO_KEYS)}) brings it back. Earlier versions of a scene's text are in History, on the
          Write page.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false)
              openBookDialog("backups", trigger.current)
            }}
          >
            Backups…
          </Button>
          {shown === "failed" && (
            <Button size="sm" disabled={retrying} onClick={() => void retry()}>
              {retrying ? "Trying…" : "Try again"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
