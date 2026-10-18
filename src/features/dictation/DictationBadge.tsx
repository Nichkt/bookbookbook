import { CloudIcon, ShieldCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { recognitionConstructor, speechVendor } from "@/speech/engine"
import { openSpeechSetup, useSpeechSettings } from "@/speech/settings"

/**
 * Where speech becomes text, beside a Dictate button once dictation is set up (DESIGN.md §10, "engine badge"). It
 * opens Dictation settings.
 */
export function DictationBadge({ className }: { className?: string }) {
  const settings = useSpeechSettings()
  if (settings.isLoading || !settings.engine || !recognitionConstructor()) return null
  const onDevice = settings.engine === "on-device"
  const text = onDevice ? "On this device" : `Online · ${speechVendor(navigator.userAgent)}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={`Dictation settings: ${text}`}
          data-dictation-badge={settings.engine}
          onClick={(event) => openSpeechSetup(null, event.currentTarget)}
          className={cn("text-muted-foreground", className)}
        >
          {onDevice ? <ShieldCheckIcon aria-hidden="true" /> : <CloudIcon aria-hidden="true" />}
          {text}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Dictation settings</TooltipContent>
    </Tooltip>
  )
}
