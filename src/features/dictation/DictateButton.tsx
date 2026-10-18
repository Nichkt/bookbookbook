import { MicIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { toggleDictation } from "@/speech/dictate"
import { useDictatingInto, type DictationTarget } from "@/speech/dictation"
import { useSpeechSettings } from "@/speech/settings"

interface DictateButtonProps extends Omit<ComponentProps<typeof Button>, "onClick" | "children"> {
  target: DictationTarget
  /** For the word "Dictate", e.g. "sr-only lg:not-sr-only" to show only the microphone below lg. */
  labelClassName?: string
  /** Runs as dictation starts, e.g. to stop reading aloud, which the microphone would hear. */
  onStart?: () => void
  /** Its shortcut, as shortcutLabel takes them, where it has one. */
  keys?: string
}

/**
 * Starts dictating into a box, and shows pressed while it listens (DESIGN.md §10). Pressed again, it stops, even if
 * it's been disabled meanwhile. The first time, it opens the setup dialog.
 */
export function DictateButton({
  target,
  labelClassName,
  onStart,
  keys,
  className,
  disabled,
  variant = "outline",
  size = "sm",
  ...props
}: DictateButtonProps) {
  const settings = useSpeechSettings()
  const on = useDictatingInto(target.id)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          // Until the settings load, a press couldn't tell whether dictation needs setting up first.
          disabled={settings.isLoading || (disabled && !on)}
          aria-pressed={on}
          aria-keyshortcuts={keys && ariaShortcut(keys)}
          data-dictate={target.id}
          data-tour="dictate"
          // Keeps the caret where it is in the text, which is where the words go.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (!on) onStart?.()
            // Once it's set up, focus goes back where it was: in the text, with a mouse, so the words go there.
            const active = document.activeElement
            const from = active instanceof HTMLElement && active !== document.body ? active : event.currentTarget
            void toggleDictation(target, settings, from)
          }}
          className={cn(
            "aria-pressed:border-destructive/40 aria-pressed:bg-destructive/10 aria-pressed:text-destructive",
            className,
          )}
          {...props}
        >
          <MicIcon aria-hidden="true" className={cn(on && "animate-pulse")} />
          <span className={labelClassName}>Dictate</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {on ? "Stop dictating" : "Dictate: say it, and it's typed"}
        {keys && ` · ${shortcutLabel(keys)}`}
      </TooltipContent>
    </Tooltip>
  )
}
