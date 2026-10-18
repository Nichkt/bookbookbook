import { ExternalLinkIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  CONTEXT_SIZES,
  contextSizeLabel,
  LOCAL_SERVERS,
  ollamaAllows,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
} from "@/ai/providers"
import {
  choiceFor,
  forgetKey,
  isWebAddress,
  maskedKey,
  saveKey,
  setupProblem,
  withChoice,
  type AiSettings,
} from "@/ai/settings"
import { AiError, listModels } from "@/ai/stream"
import { TermHint } from "@/features/help/TermHint"
import { useWrite } from "../writeContext"
import { closeAiDialog, returnFromAiDialog, useAiDialogs } from "./aiState"
import { useAiSettings, useAiTint } from "./useAi"

const RADIO_CARD =
  "flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"

/** Where the AI runs, its model and how much it reads, and the tint on what it writes (DESIGN.md §9). */
export function AiSettingsDialog() {
  const open = useAiDialogs((state) => state.open === "settings")
  const session = useAiDialogs((state) => state.session)
  // Loaded before the dialog opens, so it opens with the settings in it.
  const ai = useAiSettings()
  const tint = useAiTint()
  const loading = ai.isLoading || tint.isLoading
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAiDialog()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (returnFromAiDialog()) event.preventDefault()
        }}
      >
        {loading ? (
          <DialogHeader>
            <DialogTitle>AI settings</DialogTitle>
            <DialogDescription>Loading…</DialogDescription>
          </DialogHeader>
        ) : (
          <SettingsForm key={session} ai={ai} tint={tint} />
        )}
      </DialogContent>
    </Dialog>
  )
}

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; message: string; ok: boolean }

interface SettingsFormProps {
  ai: ReturnType<typeof useAiSettings>
  tint: ReturnType<typeof useAiTint>
}

function SettingsForm({ ai, tint }: SettingsFormProps) {
  const { db } = useWrite()
  const id = useId()
  const [draft, setDraft] = useState<AiSettings>(ai.settings)
  /** Keys typed in, by provider, not yet saved. */
  const [typedKeys, setTypedKeys] = useState<Partial<Record<ProviderId, string>>>({})
  const [tintOn, setTintOn] = useState(tint.tint)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<CheckState>({ status: "idle" })
  /** Models the provider listed when the connection was checked. */
  const [found, setFound] = useState<readonly string[]>([])
  const checking = useRef<AbortController | null>(null)
  useEffect(() => () => checking.current?.abort(), [])

  const providerId = draft.provider
  const provider = providerId ? PROVIDERS[providerId] : null
  const choice = providerId ? choiceFor(draft, providerId) : null
  const savedKey = providerId ? ai.keys.get(providerId) : undefined
  const typedKey = providerId ? (typedKeys[providerId] ?? "") : ""

  const pickProvider = (next: ProviderId) => {
    checking.current?.abort()
    setDraft((current) => ({ ...current, provider: next }))
    setCheck({ status: "idle" })
    setFound([])
    setError(null)
  }
  const patch = (change: Parameters<typeof withChoice>[2]) => {
    if (!providerId) return
    setDraft((current) => withChoice(current, providerId, change))
    setError(null)
  }

  const keysWithTyped = () => {
    const keys = new Map(ai.keys)
    for (const [key, value] of Object.entries(typedKeys)) if (value?.trim()) keys.set(key, value.trim())
    return keys
  }

  const checkConnection = async () => {
    if (!provider || !choice) return
    checking.current?.abort()
    const key = typedKey.trim() || savedKey || null
    if (provider.keyUrl && !key) {
      setCheck({ status: "done", ok: false, message: `Add your ${provider.name} API key first.` })
      return
    }
    if (!isWebAddress(choice.baseUrl)) {
      setCheck({ status: "done", ok: false, message: "Check the address: it should start with http:// or https://." })
      return
    }
    const controller = new AbortController()
    checking.current = controller
    setCheck({ status: "checking" })
    try {
      const models = await listModels(
        {
          provider,
          model: choice.model.trim(),
          baseUrl: choice.baseUrl.trim().replace(/\/+$/, ""),
          contextTokens: choice.contextTokens,
          key,
        },
        fetch,
        controller.signal,
      )
      if (controller.signal.aborted) return
      setFound(models)
      if (!choice.model.trim() && models.length > 0) {
        patch({ model: provider.models.find((model) => models.includes(model)) ?? models[0] })
      }
      const count = models.length
      const message =
        count === 0
          ? `Connected, but ${provider.who.charAt(0).toLowerCase()}${provider.who.slice(1)} has no models to offer.`
          : `Connected. ${count} ${count === 1 ? "model" : "models"} to choose from.`
      setCheck({ status: "done", ok: count > 0, message })
      announce(message)
    } catch (reason) {
      if (controller.signal.aborted) return
      const message = reason instanceof AiError ? reason.message : "Couldn't check the connection. Try again."
      setCheck({ status: "done", ok: false, message })
      announce(message)
    } finally {
      if (checking.current === controller) checking.current = null
    }
  }

  const forget = async () => {
    if (!providerId || !provider) return
    const done = await attempt("forget key", forgetKey(db, providerId).then(() => true))
    if (!done) return
    setTypedKeys((current) => ({ ...current, [providerId]: "" }))
    toast(`Removed your ${provider.name} key from this device.`)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (draft.provider) {
      const problem = setupProblem(draft, keysWithTyped())
      if (problem) {
        setError(problem)
        announce(problem)
        return
      }
    }
    setBusy(true)
    const typed = Object.entries(typedKeys).filter((entry): entry is [ProviderId, string] => !!entry[1]?.trim())
    const saved = await attempt(
      "save AI settings",
      (async () => {
        for (const [provider, secret] of typed) await saveKey(db, provider, secret)
        ai.save(draft)
        if (tintOn !== tint.tint) tint.setTint(tintOn)
        return true
      })(),
    )
    setBusy(false)
    if (!saved) return
    closeAiDialog()
    toast(draft.provider ? "AI settings saved. The AI tools are ready." : "AI settings saved.")
  }

  const modelOptions = [...new Set([...(provider?.models ?? []), ...found])]
  const sizes: number[] = [...CONTEXT_SIZES]
  if (choice && !sizes.includes(choice.contextTokens)) sizes.push(choice.contextTokens)
  sizes.sort((a, b) => a - b)
  const origin = window.location.origin

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5" data-ai-settings>
      <DialogHeader>
        <DialogTitle>AI settings</DialogTitle>
        <DialogDescription>
          Choose the AI model the AI tools write with. These settings, and any key, stay on this device.
        </DialogDescription>
      </DialogHeader>

      <fieldset>
        <legend className="mb-3 text-sm leading-none font-medium">Where the AI runs</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDER_IDS.map((option, index) => {
            const info = PROVIDERS[option]
            return (
              <label key={option} className={RADIO_CARD}>
                <input
                  type="radio"
                  name={`${id}-provider`}
                  value={option}
                  checked={providerId === option}
                  onChange={() => pickProvider(option)}
                  autoFocus={providerId ? providerId === option : index === 0}
                  aria-labelledby={`${id}-${option}`}
                  aria-describedby={`${id}-${option}-hint`}
                  data-ai-provider={option}
                  className="mt-px size-4 shrink-0 accent-primary outline-none"
                />
                <span className="grid gap-1.5">
                  <span id={`${id}-${option}`} className="text-sm leading-none font-medium">
                    {info.name}
                  </span>
                  <span id={`${id}-${option}-hint`} className="text-xs text-muted-foreground">
                    {info.blurb}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {provider && choice && (
        <>
          {provider.keyUrl ? (
            <div className="grid gap-2">
              <div className="flex items-center gap-1">
                <Label htmlFor={`${id}-key`}>{provider.name} API key</Label>
                <TermHint term="api-key" />
              </div>
              <Input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={savedKey ? "Paste a new key to replace it" : "Paste your key"}
                value={typedKey}
                onChange={(event) => {
                  setTypedKeys((current) => ({ ...current, [provider.id]: event.target.value }))
                  setError(null)
                }}
                aria-describedby={`${id}-key-hint`}
                data-ai-key
              />
              <div id={`${id}-key-hint`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {savedKey ? (
                  <span className="text-muted-foreground">
                    Saved key: <span className="font-mono">{maskedKey(savedKey)}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">You pay {provider.name} for what you use.</span>
                )}
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
                >
                  Get a key
                  <ExternalLinkIcon className="size-3" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                {savedKey && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto p-0 text-xs"
                    onClick={() => void forget()}
                  >
                    Remove the saved key
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="flex items-center gap-1">
                <Label htmlFor={`${id}-address`}>Address</Label>
                <TermHint term="local-model" />
              </div>
              <Input
                id={`${id}-address`}
                autoComplete="off"
                spellCheck={false}
                value={choice.baseUrl}
                onChange={(event) => patch({ baseUrl: event.target.value })}
                aria-describedby={`${id}-address-hint`}
                data-ai-address
              />
              <div className="flex flex-wrap gap-1.5">
                {LOCAL_SERVERS.map((server) => (
                  <Button
                    key={server.name}
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-pressed={choice.baseUrl.trim().replace(/\/+$/, "") === server.baseUrl}
                    onClick={() => patch({ baseUrl: server.baseUrl })}
                  >
                    {server.name}
                  </Button>
                ))}
              </div>
              <div id={`${id}-address-hint`} className="grid gap-1 text-xs text-muted-foreground">
                <p>
                  {ollamaAllows(origin) ? (
                    "Ollama: start it, and it answers this page."
                  ) : (
                    <>
                      Ollama: start it with <code className="font-mono">OLLAMA_ORIGINS={origin}</code> set, so it
                      answers this page.
                    </>
                  )}
                </p>
                <p>LM Studio: start its server, with “Enable CORS” turned on.</p>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor={`${id}-model`}>Model</Label>
              <TermHint term="model" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${id}-model`}
                list={`${id}-models`}
                autoComplete="off"
                spellCheck={false}
                placeholder={provider.id === "local" ? "llama3.1" : (provider.models[0] ?? "")}
                value={choice.model}
                onChange={(event) => patch({ model: event.target.value })}
                aria-describedby={`${id}-check`}
                className="min-w-0 flex-1"
                data-ai-model
              />
              <datalist id={`${id}-models`}>
                {modelOptions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <Button
                type="button"
                variant="outline"
                onClick={() => void checkConnection()}
                disabled={check.status === "checking"}
                data-ai-check
              >
                {check.status === "checking" && (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                )}
                Check connection
              </Button>
            </div>
            <p
              id={`${id}-check`}
              className={
                check.status === "done" && !check.ok ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
              data-ai-check-result
            >
              {check.status === "checking"
                ? "Checking…"
                : check.status === "done"
                  ? check.message
                  : provider.id === "local"
                    ? "Type the model's name as your app lists it, or check the connection to choose from them."
                    : "Type a model's name, or check the connection to choose from those your key can use."}
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor={`${id}-size`}>How much it can read</Label>
              <TermHint term="token" />
            </div>
            <Select
              value={String(choice.contextTokens)}
              onValueChange={(value) => patch({ contextTokens: Number(value) })}
            >
              <SelectTrigger id={`${id}-size`} className="w-full" aria-describedby={`${id}-size-hint`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {sizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {contextSizeLabel(size)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id={`${id}-size-hint`} className="text-xs text-muted-foreground">
              {provider.id === "local"
                ? "No more than your model can take. More lets the AI see more of your book, but it's slower."
                : "More lets the AI see more of your book, but each run costs more."}
            </p>
          </div>
        </>
      )}

      <div className="grid gap-1.5">
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox
            id={`${id}-tint`}
            checked={tintOn}
            onCheckedChange={(checked) => setTintOn(checked === true)}
            aria-describedby={`${id}-tint-hint`}
            data-ai-tint-setting
          />
          <Label htmlFor={`${id}-tint`} className="font-normal">
            Tint the text the AI wrote
          </Label>
        </div>
        <p id={`${id}-tint-hint`} className="pl-6 text-xs text-muted-foreground">
          A faint color shows what the AI wrote until you change it. Hidden or not, the counts still know.
        </p>
      </div>

      <p className="rounded-lg bg-muted/60 p-3 text-xs text-ink-2">
        {provider?.id === "local"
          ? "Your writing goes only to the model on this computer."
          : provider
            ? `When you run a tool, what it reads goes straight from this browser to ${provider.name}. ` +
              "bookbookbook never sees it."
            : "Nothing is sent anywhere until you choose where the AI runs and run a tool."}
      </p>

      {error && (
        <p className="text-sm text-destructive" data-ai-settings-error>
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
