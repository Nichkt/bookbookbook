import {
  BookPlusIcon,
  CheckIcon,
  CopyIcon,
  HeadingIcon,
  ListPlusIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SquareIcon,
  TextCursorInputIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react"
import { announce } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ideaActions, worldTypeFor, type Card, type CardOutput } from "@/ai/cards"
import { inlineRuns, proseBlocks } from "@/ai/insert"
import {
  cleanProse,
  ideaParts,
  parseFeedback,
  parseList,
  parseNames,
  parseSenses,
  parseSummary,
  type Group,
} from "@/ai/parse"
import { PROVIDERS } from "@/ai/providers"
import { shownOutput, stopRun, useRuns } from "@/ai/runs"
import { routeLabel } from "@/ai/settings"
import { cn } from "@/lib/utils"
import { openAddToWorldWith } from "../addToWorld"
import {
  addMoments,
  copyText,
  groupsText,
  insertAtCaret,
  replaceOriginal,
  setChapterText,
  type AiPage,
} from "./aiActions"
import { openAiSettings } from "./aiState"

const FOCUS_RING = "rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const PROSE = "grid gap-2 font-serif text-[0.95rem] leading-relaxed text-ink"

/** "3:42 PM" today, else "Mar 3". */
function whenLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const NEEDS_SETTINGS = new Set(["key", "model", "network", "limit"])

interface AiCardProps {
  card: Card
  page: AiPage
  onRetry: (card: Card) => void
  onDismiss: (card: Card) => void
}

/** One run of a tool, newest first in the AI panel, with what can be done with its answer (DESIGN.md §9 "Tools"). */
export function AiCard({ card, page, onRetry, onDismiss }: AiCardProps) {
  const live = useRuns((state) => state.runs[card.id])
  const output = shownOutput(card, live)
  const { request, status } = output
  const id = useId()
  const headingId = `${id}-heading`
  const who = card.route ? PROVIDERS[card.route].who : "The AI"

  // Says when an answer that was coming in is done, or didn't come.
  const was = useRef(status)
  useEffect(() => {
    const before = was.current
    was.current = status
    if (before !== "running" || status === "running") return
    if (status === "done") announce(`${request.toolName} is ready.`)
    else if (status === "error") announce(`${request.toolName} didn't work. ${output.error?.message ?? ""}`.trim())
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps -- as the status changes only

  return (
    <article
      data-ai-card={card.id}
      data-ai-card-status={status}
      aria-labelledby={headingId}
      aria-busy={status === "running"}
      className="grid gap-3 rounded-lg border bg-page p-3 shadow-xs"
    >
      <header className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <h4
            id={headingId}
            tabIndex={-1}
            data-ai-card-heading={card.id}
            className={cn("text-sm font-medium", FOCUS_RING)}
          >
            {request.toolName}
          </h4>
          <p className="truncate text-xs text-muted-foreground">
            {card.route ? routeLabel(card.route, card.model) : card.model}
            {card.createdAt && (
              <>
                {" · "}
                <time dateTime={card.createdAt}>{whenLabel(card.createdAt)}</time>
              </>
            )}
          </p>
        </div>
        {status === "running" ? (
          <Button variant="ghost" size="sm" onClick={() => stopRun(card.id)} className="text-ink-2">
            <SquareIcon />
            Stop
          </Button>
        ) : (
          <IconAction label="Run again" icon={RotateCcwIcon} onClick={() => onRetry(card)} describedBy={headingId} />
        )}
        <IconAction label="Dismiss" icon={XIcon} onClick={() => onDismiss(card)} describedBy={headingId} />
      </header>

      {status === "error" ? (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-destructive">{output.error?.message ?? "Something went wrong."}</p>
          {output.error && NEEDS_SETTINGS.has(output.error.kind) && (
            <Button variant="outline" size="sm" onClick={(event) => openAiSettings(event.currentTarget)}>
              AI settings
            </Button>
          )}
        </div>
      ) : (
        <CardBody card={card} output={output} page={page} id={id} who={who} />
      )}

      <CardNotes output={output} />
    </article>
  )
}

function CardNotes({ output }: { output: CardOutput }) {
  const notes: string[] = []
  if (output.status === "stopped") notes.push("Stopped.")
  if (output.status === "done" && output.finish === "length") {
    notes.push("It ran out of room, so the answer stops short.")
  }
  if (output.trimmed) notes.push("Some of the book was left out to fit what the AI can read.")
  if (notes.length === 0) return null
  return <p className="text-xs text-muted-foreground">{notes.join(" ")}</p>
}

interface BodyProps {
  card: Card
  output: CardOutput
  page: AiPage
  /** For the ids of its parts. */
  id: string
  /** Who's answering, as in "Waiting for OpenAI". */
  who: string
}

function CardBody(props: BodyProps) {
  const { output, who } = props
  const first = output.variants[0] ?? ""
  if (output.status === "running" && output.variants.every((text) => !cleanProse(text))) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Waiting for {who.charAt(0).toLowerCase() + who.slice(1)}…
      </p>
    )
  }
  switch (output.request.output) {
    case "prose":
      return <ProseAnswers {...props} />
    case "senses":
      return <SenseLines {...props} groups={parseSenses(first)} />
    case "ideas":
      return <IdeaList {...props} ideas={parseList(first)} />
    case "names":
      return <NameList {...props} />
    case "summary":
      return <SummaryAnswer {...props} />
    case "feedback":
      return <FeedbackNotes {...props} groups={parseFeedback(first)} />
  }
}

/** Prose as it'll read in the book: paragraphs, scene breaks, and bold and italic in place of Markdown's stars. */
function ProseText({ id, text }: { id?: string; text: string }) {
  return (
    <div id={id} className={PROSE}>
      {proseBlocks(text).map((block, index) =>
        block.kind === "break" ? (
          <p key={index} className="text-center tracking-[0.5em] text-muted-foreground">
            <span aria-hidden="true">* * *</span>
            <span className="sr-only">Scene break</span>
          </p>
        ) : (
          <p key={index}>
            {inlineRuns(block.text).map((run, at) => {
              let node: ReactNode = run.text
              if (run.italic) node = <em>{node}</em>
              if (run.bold) node = <strong>{node}</strong>
              return <span key={at}>{node}</span>
            })}
          </p>
        ),
      )}
    </div>
  )
}

function UsedNote() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CheckIcon className="size-3.5" aria-hidden="true" />
      Used
    </span>
  )
}

function ProseAnswers({ card, output, page }: BodyProps) {
  const texts = output.variants.map(cleanProse)
  const many = texts.length > 1
  const settled = output.status !== "running"
  const replaces = output.request.placement === "replace" && !!output.request.selection
  return (
    <div className="grid gap-3">
      {texts.map((text, index) => {
        const used = output.used?.includes(index) ?? false
        const shown = text.trim()
        return (
          <section
            key={index}
            aria-label={many ? `Version ${index + 1}` : undefined}
            className={cn("grid gap-2", index > 0 && "border-t pt-3")}
          >
            {many && <h5 className="text-xs font-semibold text-muted-foreground">Version {index + 1}</h5>}
            {shown ? (
              <ProseText text={shown} />
            ) : (
              <p className="text-sm text-muted-foreground">{settled ? "No answer." : "Writing…"}</p>
            )}
            {settled && shown && (
              <div className="flex flex-wrap items-center gap-1.5">
                {replaces ? (
                  <Button size="sm" variant="outline" onClick={() => replaceOriginal(page, card, index, text)}>
                    Replace
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => insertAtCaret(page, card, index, text)}>
                    Insert
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void copyText(shown)} className="text-ink-2">
                  Copy
                </Button>
                {used && <UsedNote />}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

interface IconActionProps {
  label: string
  icon: LucideIcon
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  /** The text it acts on, so each button in a list says which item it's for. */
  describedBy?: string
}

function IconAction({ label, icon: Icon, onClick, describedBy }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-describedby={describedBy}
          onClick={onClick}
          className="shrink-0 text-muted-foreground"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

interface ItemProps {
  /** The item's text's id. */
  textId: string
  children: ReactNode
  actions: ReactNode
}

function Item({ textId, children, actions }: ItemProps) {
  return (
    <li className="flex items-start gap-1 rounded-md py-0.5 text-sm hover:bg-muted/40">
      <span id={textId} className="min-w-0 flex-1 py-1 pl-1 text-ink">
        {children}
      </span>
      {actions && <span className="flex shrink-0 items-center">{actions}</span>}
    </li>
  )
}

function SenseLines({ card, output, page, id, groups }: BodyProps & { groups: Group[] }) {
  const settled = output.status !== "running"
  return (
    <div className="grid gap-3">
      {groups.map((group, at) => (
        <section key={group.heading} aria-labelledby={`${id}-g${at}`} className="grid gap-1">
          <h5 id={`${id}-g${at}`} className="text-xs font-semibold text-muted-foreground">
            {group.heading}
          </h5>
          <ul className="grid">
            {group.items.map((item, index) => {
              const textId = `${id}-g${at}-${index}`
              return (
                <Item
                  key={index}
                  textId={textId}
                  actions={
                    settled && (
                      <>
                        <IconAction
                          label="Insert"
                          icon={TextCursorInputIcon}
                          describedBy={textId}
                          onClick={() => insertAtCaret(page, card, null, item)}
                        />
                        <IconAction
                          label="Copy"
                          icon={CopyIcon}
                          describedBy={textId}
                          onClick={() => void copyText(item)}
                        />
                      </>
                    )
                  }
                >
                  {item}
                </Item>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function IdeaList({ card, output, page, id, ideas }: BodyProps & { ideas: string[] }) {
  const settled = output.status !== "running"
  const can = ideaActions(output.request)
  const typeKey = worldTypeFor(output.request)
  return (
    <ol className="grid">
      {ideas.map((idea, index) => {
        const textId = `${id}-i${index}`
        const named = can.world ? ideaParts(idea) : null
        return (
          <Item
            key={index}
            textId={textId}
            actions={
              settled && (
                <>
                  {can.moment && (
                    <IconAction
                      label="Add as a moment"
                      icon={ListPlusIcon}
                      describedBy={textId}
                      onClick={() => void addMoments(page, card, [idea])}
                    />
                  )}
                  {can.title && (
                    <IconAction
                      label="Use as the chapter's title"
                      icon={HeadingIcon}
                      describedBy={textId}
                      onClick={() => void setChapterText(page, card, { title: idea.replace(/^["“]|["”]$/g, "") })}
                    />
                  )}
                  {named && (
                    <IconAction
                      label="Add to World"
                      icon={BookPlusIcon}
                      describedBy={textId}
                      onClick={(event) =>
                        openAddToWorldWith({ name: named.name, notes: named.note, typeKey }, event.currentTarget)
                      }
                    />
                  )}
                  <IconAction label="Copy" icon={CopyIcon} describedBy={textId} onClick={() => void copyText(idea)} />
                </>
              )
            }
          >
            {idea}
          </Item>
        )
      })}
    </ol>
  )
}

function NameList({ output, id }: BodyProps) {
  const settled = output.status !== "running"
  const typeKey = worldTypeFor(output.request)
  const names = parseNames(output.variants[0] ?? "")
  return (
    <ul className="grid">
      {names.map((idea, index) => {
        const textId = `${id}-n${index}`
        return (
          <Item
            key={index}
            textId={textId}
            actions={
              settled && (
                <>
                  <IconAction
                    label="Add to World"
                    icon={BookPlusIcon}
                    describedBy={textId}
                    onClick={(event) =>
                      openAddToWorldWith({ name: idea.name, notes: idea.note, typeKey }, event.currentTarget)
                    }
                  />
                  <IconAction
                    label="Copy"
                    icon={CopyIcon}
                    describedBy={textId}
                    onClick={() => void copyText(idea.name)}
                  />
                </>
              )
            }
          >
            <span className="font-medium">{idea.name}</span>
            {idea.note && <span className="text-ink-2"> — {idea.note}</span>}
          </Item>
        )
      })}
    </ul>
  )
}

function SummaryAnswer({ card, output, page, id }: BodyProps) {
  const settled = output.status !== "running"
  const { summary, moments } = parseSummary(output.variants[0] ?? "")
  return (
    <div className="grid gap-3">
      {summary && (
        <section aria-labelledby={`${id}-summary`} className="grid gap-1.5">
          <h5 id={`${id}-summary`} className="text-xs font-semibold text-muted-foreground">
            Summary
          </h5>
          <p className="text-sm text-ink">{summary}</p>
          {settled && (
            <div>
              <Button size="sm" variant="outline" onClick={() => void setChapterText(page, card, { summary })}>
                Use as the chapter's summary
              </Button>
            </div>
          )}
        </section>
      )}
      {moments.length > 0 && (
        <section aria-labelledby={`${id}-moments`} className="grid gap-1.5">
          <h5 id={`${id}-moments`} className="text-xs font-semibold text-muted-foreground">
            Moments
          </h5>
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-ink">
            {moments.map((moment, index) => (
              <li key={index}>{moment}</li>
            ))}
          </ol>
          {settled && (
            <div>
              <Button size="sm" variant="outline" onClick={() => void addMoments(page, card, moments)}>
                Add these moments to the chapter
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function FeedbackNotes({ output, id, groups }: BodyProps & { groups: Group[] }) {
  const settled = output.status !== "running"
  return (
    <div className="grid gap-3">
      {groups.map((group, at) => (
        <section key={group.heading} aria-labelledby={`${id}-f${at}`} className="grid gap-1">
          <h5 id={`${id}-f${at}`} className="text-xs font-semibold text-muted-foreground">
            {group.heading}
          </h5>
          <ul className="grid list-disc gap-1 pl-5 text-sm text-ink">
            {group.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      {settled && groups.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => void copyText(groupsText(groups))} className="text-ink-2">
            <CopyIcon />
            Copy the notes
          </Button>
        </div>
      )}
    </div>
  )
}
