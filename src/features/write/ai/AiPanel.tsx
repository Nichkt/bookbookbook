import { Settings2Icon, SparklesIcon, WrenchIcon, XIcon, type LucideIcon } from "lucide-react"
import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { announce, attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Card } from "@/ai/cards"
import type { GatherSource } from "@/ai/gather"
import { choiceFor, type Connection } from "@/ai/settings"
import {
  BUILTIN_TOOLS,
  fieldShown,
  TOOL_GROUPS,
  toolById,
  type FieldValues,
  type ToolDef,
  type ToolField,
} from "@/ai/tools"
import { useCodex } from "@/features/codex/codexData"
import { TermHint } from "@/features/help/TermHint"
import { byData, focusSoon } from "@/lib/focus"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { useWrite, useWritePlace } from "../writeContext"
import { AiCard } from "./AiCard"
import { clearResults, retryCard, runTool, stopAndDismiss, type AiPage, type RunSource } from "./aiActions"
import {
  AI_SETUP_BUTTON,
  AI_TOOL_PICKER,
  CONTINUE_KEYS,
  openAiSettings,
  openCustomTools,
  takePendingRun,
  usePendingRun,
} from "./aiState"
import { ContextPreview } from "./ContextPreview"
import {
  useAiSettings,
  useAiShare,
  useCards,
  useCustomTools,
  useSlotsOff,
  useToolChoice,
  useToolTarget,
} from "./useAi"

const HEADER = "sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-surface/95 px-4 backdrop-blur"
const FOCUS_RING = "rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const LABEL_HEADING = "mr-auto text-xs font-semibold tracking-widest text-muted-foreground uppercase"
const RESULTS_HEADING = "[data-ai-results-heading]"
/** What the preview reckons with before the AI tools are set up. */
const UNSET_CONTEXT = 8000
/** A shortcut's run that waited longer than this for the panel is dropped, rather than run out of the blue. */
const PENDING_MS = 10_000

/** Where requests go, as the panel says before a run (DESIGN.md §9 "Privacy rules"). */
function routeSentence(connection: Connection): string {
  const { provider, model } = connection
  return provider.id === "local"
    ? `Runs on this computer, with ${model}. Nothing leaves it.`
    : `Sends what it reads to ${provider.name}, for ${model}.`
}

/**
 * The AI tools beside the text (DESIGN.md §9): a tool to run on the caret, the selection or the chapter, what it
 * would send, and the cards its runs come back as, newest first, each with what can be done with it.
 */
export function AiPanel({ onClose }: { onClose: () => void }) {
  const { db, bookId, book, plan, unit, panelDocked, closePanelTo } = useWrite()
  const { chapterId } = useWritePlace()
  const navigate = useNavigate()
  const codex = useCodex(bookId)
  const ai = useAiSettings()
  const custom = useCustomTools()
  const { tool, fields, setTool, setField, fieldsFor, isLoading: choiceLoading } = useToolChoice(custom.tools)
  const slots = useSlotsOff()
  const cards = useCards(bookId)
  const share = useAiShare(bookId, chapterId)
  const target = useToolTarget(tool, fields, plan, chapterId)
  const id = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const startingNow = useRef(false)
  /** A new card to bring into view once it's on the page. */
  const reveal = useRef<string | null>(null)

  const source = useMemo<GatherSource>(() => ({ db, book, plan, codex, chapterId }), [db, book, plan, codex, chapterId])
  const page = useMemo<AiPage>(
    () => ({
      db,
      bookId,
      plan,
      unit,
      chapterId,
      panelDocked,
      closePanelTo,
      navigate: (path) => navigate(path, { flushSync: true }),
    }),
    [db, bookId, plan, unit, chapterId, panelDocked, closePanelTo, navigate],
  )
  const { settings, connection } = ai
  const contextTokens =
    connection?.contextTokens ??
    (settings.provider ? choiceFor(settings, settings.provider).contextTokens : UNSET_CONTEXT)
  const ready = !ai.isLoading && !custom.isLoading && !choiceLoading && !slots.isLoading && !codex.isLoading
  const runSource = (to: Connection): RunSource => ({ ...source, connection: to, slotsOff: slots.off })

  const say = (message: string) => {
    setProblem(message)
    announce(message)
  }

  const revealCard = (cardId: string) => {
    const element = document.querySelector(byData("ai-card", cardId))
    if (element) element.scrollIntoView({ block: "nearest" })
    else reveal.current = cardId
  }

  const start = async (which: ToolDef, values: FieldValues) => {
    if (startingNow.current) return
    if (!connection) {
      say(ai.problem ?? "Set up the AI tools first.")
      focusSoon(AI_SETUP_BUTTON)
      return
    }
    startingNow.current = true
    setStarting(true)
    setProblem(null)
    const result = await attempt("run an AI tool", runTool(runSource(connection), which, values))
    startingNow.current = false
    setStarting(false)
    if (!result) return
    if (result.ok) revealCard(result.cardId)
    else say(result.problem)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void start(tool, fields)
  }

  // Ctrl+J asked for a run: it goes once the panel has what it needs, just after the effect, as a click would. The
  // command palette can instead pick a tool, for the writer to fill in and run.
  const pending = usePendingRun((state) => state.pending)
  useEffect(() => {
    if (!pending || !ready) return
    const timer = setTimeout(() => {
      const taken = takePendingRun()
      const wanted = taken && Date.now() - taken.at < PENDING_MS ? toolById(taken.tool, custom.tools) : undefined
      if (!taken || !wanted) return
      if (wanted.id !== tool.id) {
        setProblem(null)
        setTool(wanted.id)
      }
      if (taken.run) void start(wanted, fieldsFor(wanted))
      else focusSoon(AI_TOOL_PICKER)
    })
    return () => clearTimeout(timer)
  }, [pending, ready]) // eslint-disable-line react-hooks/exhaustive-deps -- once per request, with the panel as it is

  useEffect(() => {
    const cardId = reveal.current
    if (!cardId) return
    const element = document.querySelector(byData("ai-card", cardId))
    if (!element) return
    element.scrollIntoView({ block: "nearest" })
    reveal.current = null
  }, [cards])

  const retry = async (card: Card) => {
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!connection) {
      toast(ai.problem ?? "Set up the AI tools first.", {
        action: { label: "AI settings", onClick: () => openAiSettings(from) },
      })
      return
    }
    const result = await attempt("run an AI tool again", retryCard(runSource(connection), card, custom.tools))
    if (!result) return
    if (result.ok) revealCard(result.cardId)
    else toast(result.problem)
  }

  const dismiss = (card: Card) => {
    const index = cards.findIndex((other) => other.id === card.id)
    const next = cards[index + 1] ?? cards[index - 1]
    const hadFocus = !!document.activeElement?.closest(byData("ai-card", card.id))
    void stopAndDismiss(db, card)
    if (hadFocus) focusSoon(next ? byData("ai-card-heading", next.id) : RESULTS_HEADING)
  }

  const clear = async () => {
    await clearResults(db, bookId, cards)
    focusSoon(RESULTS_HEADING)
  }

  const groups = TOOL_GROUPS.map((group) => ({
    group,
    tools: [...BUILTIN_TOOLS, ...custom.tools].filter((option) => option.group === group),
  })).filter((entry) => entry.tools.length > 0)
  const isContinue = tool.id === "continue"

  return (
    <div data-ai-panel className="flex min-h-full flex-col">
      <header className={HEADER}>
        <h2
          tabIndex={-1}
          data-ai-panel-heading
          className={cn(LABEL_HEADING, FOCUS_RING)}
        >
          AI tools
        </h2>
        <HeaderButton
          label="AI settings"
          icon={Settings2Icon}
          onClick={(event) => openAiSettings(event.currentTarget)}
        />
        <HeaderButton
          label="Your own tools"
          icon={WrenchIcon}
          onClick={(event) => openCustomTools(event.currentTarget)}
        />
        <HeaderButton label="Close panel" icon={XIcon} onClick={onClose} />
      </header>

      <div className="grid gap-5 px-4 pt-4 pb-6">
        {ready && ai.problem && (
          <div className="grid justify-items-start gap-2 rounded-lg border border-dashed p-3" data-ai-setup-card>
            {!settings.provider && (
              <p className="text-sm text-ink">
                The AI tools write with an AI model you choose: one running on this computer, or one from a company
                you have an account with. Nothing is sent anywhere until you run a tool.
              </p>
            )}
            <p className="text-sm text-ink-2">{ai.problem}</p>
            <Button size="sm" data-ai-setup onClick={(event) => openAiSettings(event.currentTarget)}>
              <SparklesIcon />
              {settings.provider ? "AI settings" : "Set up AI"}
            </Button>
          </div>
        )}

        <form onSubmit={submit} className="grid gap-3" aria-label="Run a tool">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-tool`}>Tool</Label>
            <Select
              value={tool.id}
              onValueChange={(value) => {
                setProblem(null)
                setTool(value)
              }}
            >
              <SelectTrigger id={`${id}-tool`} className="w-full" aria-describedby={`${id}-blurb`} data-ai-tool>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {groups.map(({ group, tools }, index) => (
                  <Fragment key={group}>
                    {index > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel>{group}</SelectLabel>
                      {tools.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </Fragment>
                ))}
              </SelectContent>
            </Select>
            <p id={`${id}-blurb`} className="text-xs text-muted-foreground">
              {tool.blurb}
            </p>
          </div>

          {tool.fields
            .filter((field) => fieldShown(field, fields))
            .map((field) => (
              <FieldInput
                key={`${tool.id}:${field.key}`}
                id={`${id}-${field.key}`}
                field={field}
                value={fields[field.key] ?? ""}
                onChange={(value) => setField(field.key, value)}
              />
            ))}

          <p className="text-sm text-ink-2" data-ai-target>
            {target}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={starting}
              data-ai-run
              aria-keyshortcuts={isContinue ? ariaShortcut(CONTINUE_KEYS) : undefined}
            >
              <SparklesIcon />
              Run {tool.name}
            </Button>
            {isContinue && (
              <span className="text-xs text-muted-foreground" aria-hidden="true">
                {shortcutLabel(CONTINUE_KEYS)} from your text
              </span>
            )}
          </div>
          {problem && (
            <p className="text-sm text-destructive" data-ai-problem>
              {problem}
            </p>
          )}
          {connection && <p className="text-xs text-muted-foreground">{routeSentence(connection)}</p>}
        </form>

        {ready && (
          <ContextPreview
            source={source}
            tool={tool}
            fields={fields}
            slotsOff={slots.off}
            setSlot={slots.setSlot}
            contextTokens={contextTokens}
          />
        )}

        <section aria-labelledby={`${id}-results`} className="grid gap-3">
          <div className="flex min-h-8 items-center gap-2">
            <h3
              id={`${id}-results`}
              tabIndex={-1}
              data-ai-results-heading
              className={cn(LABEL_HEADING, FOCUS_RING)}
            >
              Results
            </h3>
            {cards.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void clear()} className="text-ink-2">
                Clear all
              </Button>
            )}
          </div>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              What the tools write shows here, newest first, for you to put in your text or not.
            </p>
          ) : (
            cards.map((card) => (
              <AiCard key={card.id} card={card} page={page} onRetry={(it) => void retry(it)} onDismiss={dismiss} />
            ))
          )}
        </section>
      </div>

      {share.book && (
        <p className="mt-auto flex items-center gap-1 border-t px-4 py-2 text-xs text-muted-foreground" data-ai-share>
          AI-written: {share.chapter ?? "0%"} of this chapter · {share.book} of the book
          <TermHint term="ai-written" />
        </p>
      )}
    </div>
  )
}

function HeaderButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: LucideIcon
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className="text-muted-foreground">
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

interface FieldInputProps {
  id: string
  field: ToolField
  value: string
  onChange: (value: string) => void
}

function FieldInput({ id, field, value, onChange }: FieldInputProps) {
  if (field.kind === "choice") {
    const term = field.terms?.[value]
    return (
      <div className="grid gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor={id}>{field.label}</Label>
          {term && <TermHint term={term} />}
        </div>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.multiline ? (
        <Textarea
          id={id}
          rows={3}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter starts a new line here, so Ctrl+Enter runs the tool.
            if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
        />
      ) : (
        <Input
          id={id}
          autoComplete="off"
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}
