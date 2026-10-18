import { usePowerSync } from "@powersync/react"
import { useEffect, useId, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { announce, attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { refocus } from "@/features/help/helpStore"
import { TermHint } from "@/features/help/TermHint"
import { COMMAND_HELP } from "@/speech/commands"
import { startDictation, type DictationTarget } from "@/speech/dictation"
import {
  commandsWork,
  installOnDevice,
  LANGUAGES,
  onDeviceStatus,
  recognitionConstructor,
  speechVendor,
  type EngineKind,
  type OnDeviceStatus,
  type RecognitionConstructor,
} from "@/speech/engine"
import {
  closeSpeechSetup,
  saveSpeechSettings,
  useSpeechSettings,
  useSpeechSetup,
  type SpeechSettings,
} from "@/speech/settings"

const RADIO_CARD =
  "flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-70 has-disabled:hover:bg-transparent"

/** How often to look again while the device downloads what it needs for a language. */
const DOWNLOAD_CHECK_MS = 2000

/**
 * Sets dictation up (DESIGN.md §10): the language, where speech becomes text, and voice commands. Opened by the
 * first Dictate, which it then starts, or from Dictation settings.
 */
export function DictationSetupDialog() {
  const open = useSpeechSetup((state) => state.open)
  const session = useSpeechSetup((state) => state.session)
  const target = useSpeechSetup((state) => state.target)
  // Loaded before the dialog opens, so it opens with the settings in it.
  const settings = useSpeechSettings()
  const Recognition = recognitionConstructor()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeSpeechSetup()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(event) => refocus(event, useSpeechSetup.getState().returnFocus)}
        data-dictation-setup=""
      >
        {!Recognition ? (
          <NoDictation />
        ) : settings.isLoading ? (
          <DialogHeader>
            <DialogTitle>Dictation settings</DialogTitle>
            <DialogDescription>Loading…</DialogDescription>
          </DialogHeader>
        ) : (
          <SetupForm key={session} settings={settings} target={target} Recognition={Recognition} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Firefox, and other browsers that can't turn speech into text. */
function NoDictation() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Dictation</DialogTitle>
        <DialogDescription>This browser can't turn speech into text.</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-ink-2">
        To dictate, open bookbookbook in Chrome, Edge or Safari. On a phone or tablet, the microphone key on the
        keyboard works anywhere you can type.
      </p>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">OK</Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}

const languageName = (code: string) => LANGUAGES.find((lang) => lang.code === code)?.name ?? code

function statusLine(status: OnDeviceStatus | null, language: string): string {
  switch (status) {
    case null:
      return "Checking this device…"
    case "available":
      return `Ready for ${language}.`
    case "downloadable":
      return `${language} needs a one-time download, which starts when you do.`
    case "downloading":
      return `Downloading what's needed for ${language}…`
    case "unavailable":
      return `This device can't do ${language} by itself. Choose online, or another language.`
    case "unsupported":
      return "This browser can't do it by itself. Chrome 139 or later can."
  }
}

interface SetupFormProps {
  settings: SpeechSettings
  target: DictationTarget | null
  Recognition: RecognitionConstructor
}

function SetupForm({ settings, target, Recognition }: SetupFormProps) {
  const db = usePowerSync()
  const id = useId()
  const vendor = speechVendor(navigator.userAgent)
  const [lang, setLang] = useState(settings.lang)
  /** What the writer chose. Until they choose, it's the device, if it can. */
  const [engine, setEngine] = useState<EngineKind | null>(settings.engine)
  const [commands, setCommands] = useState(settings.commands)
  const [checked, setChecked] = useState<{ lang: string; status: OnDeviceStatus } | null>(null)
  const [checks, setChecks] = useState(0)
  const [busy, setBusy] = useState<"downloading" | "saving" | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    void onDeviceStatus(lang, Recognition).then((status) => {
      if (!live) return
      setChecked({ lang, status })
      if (status === "downloading") timer = setTimeout(() => setChecks((count) => count + 1), DOWNLOAD_CHECK_MS)
    })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [lang, Recognition, checks])

  const status = checked?.lang === lang ? checked.status : null
  const deviceCan = status === "available" || status === "downloadable" || status === "downloading"
  const chosen: EngineKind | null = engine === "online" ? "online" : deviceCan ? "on-device" : null
  const language = languageName(lang)
  const english = commandsWork(lang)
  const download = chosen === "on-device" && status === "downloadable"
  const known = LANGUAGES.some((option) => option.code === lang)
  const languages = known ? LANGUAGES : [...LANGUAGES, { code: lang, name: lang }]

  const fail = (message: string) => {
    setError(message)
    announce(message)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!chosen) {
      fail(status === null ? "Still checking this device. Try again in a moment." : "Choose where speech becomes text.")
      return
    }
    setError(null)
    // The download has to start from the click, so nothing waits before it.
    if (download) {
      setBusy("downloading")
      announce(`Downloading what's needed for ${language}…`)
      const installed = await installOnDevice(lang, Recognition)
      if (!installed) {
        setBusy(null)
        setChecks((count) => count + 1)
        fail(`Couldn't download what's needed for ${language}. Check the internet connection, or choose online.`)
        return
      }
    }
    setBusy("saving")
    const next = { engine: chosen, lang, commands }
    const saved = await attempt("save dictation settings", saveSpeechSettings(db, next).then(() => true))
    setBusy(null)
    if (!saved) return
    closeSpeechSetup()
    if (target && chosen === "on-device" && status === "downloading") {
      toast(`Dictation is set up. You can dictate once ${language} has downloaded.`)
    } else if (!target || !startDictation(target, next, Recognition)) {
      toast("Dictation settings saved.")
    }
  }

  const submitLabel =
    busy === "downloading"
      ? "Downloading…"
      : target
        ? download
          ? "Download and start"
          : "Start dictating"
        : download
          ? "Download and save"
          : "Save"

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5" data-dictation-form="">
      <DialogHeader>
        <DialogTitle>{settings.engine ? "Dictation settings" : "Set up dictation"}</DialogTitle>
        <DialogDescription>
          Say your words and they're typed for you. These settings are for this device.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-lang`}>Language you'll speak</Label>
        <Select
          value={lang}
          onValueChange={(next) => {
            setLang(next)
            setError(null)
          }}
        >
          <SelectTrigger id={`${id}-lang`} className="w-full" data-dictation-lang="">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {languages.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Named by its words alone, not the hint's button too. */}
      <fieldset aria-labelledby={`${id}-where`}>
        <legend className="mb-3 flex items-center gap-1 text-sm leading-none font-medium">
          <span id={`${id}-where`}>Where speech becomes text</span>
          <TermHint term="on-device" />
        </legend>
        <div className="grid gap-2">
          <label className={RADIO_CARD}>
            <input
              type="radio"
              name={`${id}-engine`}
              value="on-device"
              checked={chosen === "on-device"}
              disabled={!deviceCan}
              onChange={() => {
                setEngine("on-device")
                setError(null)
              }}
              aria-labelledby={`${id}-device`}
              aria-describedby={`${id}-device-hint ${id}-device-status`}
              data-dictation-engine="on-device"
              className="mt-px size-4 shrink-0 accent-primary outline-none"
            />
            <span className="grid gap-1.5">
              <span id={`${id}-device`} className="text-sm leading-none font-medium">
                On this device <span className="font-normal text-muted-foreground">(recommended)</span>
              </span>
              <span id={`${id}-device-hint`} className="text-xs text-muted-foreground">
                Private: your voice never leaves this device, and it works without the internet.
              </span>
              <span
                id={`${id}-device-status`}
                className="text-xs font-medium text-ink-2"
                data-dictation-status={status ?? "checking"}
              >
                {statusLine(status, language)}
              </span>
            </span>
          </label>
          <label className={RADIO_CARD}>
            <input
              type="radio"
              name={`${id}-engine`}
              value="online"
              checked={chosen === "online"}
              onChange={() => {
                setEngine("online")
                setError(null)
              }}
              aria-labelledby={`${id}-online`}
              aria-describedby={`${id}-online-hint`}
              data-dictation-engine="online"
              className="mt-px size-4 shrink-0 accent-primary outline-none"
            />
            <span className="grid gap-1.5">
              <span id={`${id}-online`} className="text-sm leading-none font-medium">
                Online, with {vendor}
              </span>
              <span id={`${id}-online-hint`} className="text-xs text-muted-foreground">
                While you dictate, the sound of your voice goes to {vendor}'s servers to be turned into text. Needs
                the internet.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox
            id={`${id}-commands`}
            checked={commands && english}
            disabled={!english}
            onCheckedChange={(next) => setCommands(next === true)}
            aria-describedby={`${id}-commands-hint`}
            data-dictation-commands=""
          />
          <Label htmlFor={`${id}-commands`} className="font-normal">
            Voice commands
          </Label>
          <TermHint term="voice-commands" />
        </div>
        <p id={`${id}-commands-hint`} className="pl-6 text-xs text-muted-foreground">
          {english
            ? "Say “period” or “new paragraph” to punctuate as you go, and “scratch that” to take back what you " +
              "said last."
            : "Voice commands are English words, so they work only when you speak English."}
        </p>
        {english && (
          <details className="pl-6 text-xs">
            <summary className="cursor-pointer text-ink-2 pointer-coarse:py-2">All the voice commands</summary>
            <dl className="mt-2 grid gap-1.5">
              {COMMAND_HELP.map((command) => (
                <div key={command.say}>
                  <dt className="font-medium text-ink">“{command.say}”</dt>
                  <dd className="text-muted-foreground">{command.does}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>

      <p className="rounded-lg bg-muted/60 p-3 text-xs text-ink-2">
        {chosen === "on-device"
          ? "Nothing you say is sent anywhere."
          : chosen === "online"
            ? `Only while the microphone is on, what you say goes to ${vendor} and the text comes back here.`
            : "Nothing is sent anywhere until you choose."}{" "}
        You can stop listening at any time.
      </p>

      {error && (
        <p className="text-sm text-destructive" data-dictation-error="">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy !== null} data-dictation-submit="">
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
