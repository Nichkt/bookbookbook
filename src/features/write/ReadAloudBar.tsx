import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, SquareIcon } from "lucide-react"
import { useEffect, useId, type KeyboardEvent, type ReactNode } from "react"
import { desktop } from "@/app/desktop"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePref } from "@/db/prefs"
import { useEditors } from "@/editor/activeEditor"
import { isComposing } from "@/lib/keys"
import {
  parseRate,
  pauseReading,
  pickVoice,
  RATES,
  READ_ALOUD_RATE_PREF,
  READ_ALOUD_VOICE_PREF,
  readingLanguage,
  resumeReading,
  sceneAfter,
  setReadingOrder,
  setReadingVoice,
  skipSentence,
  stopIfGone,
  stopReading,
  useReadAloud,
  useVoices,
  voiceChoices,
  voiceLabels,
} from "./readAloud"
import { useWrite } from "./writeContext"

/**
 * Read aloud's controls (DESIGN.md §8), floating at the foot of the window while it reads. Always mounted on the
 * Write screen, as it also keeps reading in step with the page: the view's scenes, the voice, and typing.
 */
export function ReadAloudBar() {
  const { plan, unit } = useWrite()
  const status = useReadAloud((state) => state.status)
  const voices = useVoices()
  const voicePref = usePref(READ_ALOUD_VOICE_PREF)
  const ratePref = usePref(READ_ALOUD_RATE_PREF)
  const lang = readingLanguage()
  const voice = pickVoice(voices, voicePref.value, lang)
  const rate = parseRate(ratePref.value)
  const id = useId()

  useEffect(() => setReadingVoice(voice, rate), [voice, rate])
  useEffect(() => setReadingOrder((sceneId) => sceneAfter(plan, unit, sceneId)), [plan, unit])
  // Typing stops it, as does leaving the screen or the text it's reading leaving the page. The stop waits for the
  // keystroke to land, as taking the highlight away redraws the text it's typed into.
  useEffect(() => {
    const onBeforeInput = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".ProseMirror")) window.setTimeout(stopReading)
    }
    document.addEventListener("beforeinput", onBeforeInput, true)
    const unsubscribe = useEditors.subscribe(stopIfGone)
    return () => {
      document.removeEventListener("beforeinput", onBeforeInput, true)
      unsubscribe()
      stopReading()
    }
  }, [])

  if (status === "idle") return null
  const playing = status === "playing"
  const choices = voiceChoices(voices, voice, lang)
  const labels = voiceLabels(choices)

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Not from the speed or voice list, whose Esc closes the list. A tooltip closing on it doesn't keep it from this.
    const inBar = event.target instanceof Node && event.currentTarget.contains(event.target)
    if (event.key !== "Escape" || !inBar || isComposing(event.nativeEvent)) return
    event.preventDefault()
    stopReading(true)
  }

  return (
    <section
      aria-label="Read aloud"
      data-read-aloud-bar=""
      onKeyDown={onKeyDown}
      className="fixed inset-x-0 bottom-(--toast-bottom) z-30 mx-auto flex w-fit max-w-[calc(100vw-1rem)] items-center gap-1 rounded-full border bg-popover px-2 py-1.5 font-sans shadow-lg"
    >
      <BarButton label="Previous sentence" onClick={() => skipSentence(-1)}>
        <SkipBackIcon />
      </BarButton>
      <BarButton
        label={playing ? "Pause" : "Resume"}
        onClick={playing ? pauseReading : resumeReading}
        data-read-aloud-play=""
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </BarButton>
      <BarButton label="Next sentence" onClick={() => skipSentence(1)}>
        <SkipForwardIcon />
      </BarButton>
      <BarButton label="Stop reading" keys="Esc" onClick={() => stopReading(true)}>
        <SquareIcon />
      </BarButton>
      <Select value={String(rate)} onValueChange={(value) => void ratePref.setValue(value)}>
        <SelectTrigger size="sm" aria-label="Speed" className="ml-1 tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="top">
          {RATES.map((option) => (
            <SelectItem key={option} value={String(option)} className="tabular-nums">
              {option}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {voice && (
        <Select value={voice.voiceURI} onValueChange={(uri) => void voicePref.setValue(uri)}>
          <SelectTrigger size="sm" aria-label="Voice" aria-describedby={`${id}-voice`} className="max-w-44 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" side="top" className="max-h-72">
            {choices.map((option) => (
              <SelectItem key={option.voiceURI} value={option.voiceURI}>
                {labels.get(option.voiceURI)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <span id={`${id}-voice`} hidden>
        Online voices send the text to {desktop ? "Microsoft's" : "the browser maker's"} servers to be spoken.
      </span>
    </section>
  )
}

interface BarButtonProps {
  label: string
  keys?: string
  onClick: () => void
  children: ReactNode
  "data-read-aloud-play"?: string
}

function BarButton({ label, keys, onClick, children, ...data }: BarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-keyshortcuts={keys === "Esc" ? "Escape" : undefined}
          onClick={onClick}
          className="rounded-full text-ink-2"
          {...data}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{keys ? `${label} (${keys})` : label}</TooltipContent>
    </Tooltip>
  )
}
