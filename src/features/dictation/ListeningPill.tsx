import { SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { stopDictation, useDictation } from "@/speech/dictation"
import { speechVendor } from "@/speech/engine"

/** How much of what's being heard the pill shows: the end of it. */
const HEARD_CHARS = 60

/**
 * Shows that the microphone is on, what it's hearing, and where speech becomes text, with a way to stop (DESIGN.md
 * §10). Floats above the toasts, and above Read aloud's bar.
 */
export function ListeningPill() {
  const status = useDictation((state) => state.status)
  const label = useDictation((state) => state.label)
  const engine = useDictation((state) => state.engine)
  const interim = useDictation((state) => state.interim)
  if (status === "idle") return null
  const heard = interim.length > HEARD_CHARS ? `…${interim.slice(-(HEARD_CHARS - 1))}` : interim
  const where = engine === "online" ? `Online · ${speechVendor(navigator.userAgent)}` : "On this device"
  return (
    <section
      aria-label="Dictation"
      data-listening-pill={status}
      className="fixed inset-x-0 bottom-[calc(var(--toast-bottom)+3.5rem)] z-60 mx-auto flex w-fit max-w-[calc(100vw-1rem)] items-center gap-3 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 font-sans text-sm shadow-lg"
    >
      <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
        {status === "listening" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
        )}
        <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
      </span>
      <span className="grid min-w-0">
        <span className="truncate font-medium">
          {status === "starting"
            ? "Starting the microphone…"
            : status === "stopping"
              ? "Finishing…"
              : `Listening · into ${label}`}
        </span>
        {heard && status !== "starting" && (
          <span className="truncate text-xs text-muted-foreground italic" data-listening-heard="">
            {heard}
          </span>
        )}
      </span>
      <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-ink-2 sm:inline">{where}</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={status === "stopping"}
        // Leaves the caret in the text, where it was.
        onMouseDown={(event) => event.preventDefault()}
        onClick={stopDictation}
        className="shrink-0 rounded-full"
      >
        <SquareIcon aria-hidden="true" />
        Stop
      </Button>
    </section>
  )
}
