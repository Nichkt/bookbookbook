import { ChevronRightIcon } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { buildPrompt, slotDetail, type BuiltPrompt, type SlotId } from "@/ai/context"
import { gather, type GatherSource } from "@/ai/gather"
import { formatTokens } from "@/ai/tokens"
import type { FieldValues, ToolDef } from "@/ai/tools"
import { useActiveEditor } from "@/editor/activeEditor"
import { TermHint } from "@/features/help/TermHint"
import { cn } from "@/lib/utils"
import { TOO_BIG } from "./aiActions"

const DISCLOSURE =
  "flex items-center gap-1 rounded-sm text-sm font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"

/** Typing settles for this long before the preview catches up. */
const SETTLE_MS = 400

type Preview = { ok: true; prompt: BuiltPrompt } | { ok: false; problem: string }

interface ContextPreviewProps {
  source: GatherSource
  tool: ToolDef
  fields: FieldValues
  slotsOff: ReadonlySet<SlotId>
  setSlot: (id: SlotId, on: boolean) => void
  contextTokens: number
}

/**
 * "What the AI sees" (DESIGN.md §9 "Context assembly"): what a run would send as things stand, part by part with its
 * size, the parts the writer may leave out, and the whole prompt to read.
 */
export function ContextPreview({ source, tool, fields, slotsOff, setSlot, contextTokens }: ContextPreviewProps) {
  const [open, setOpen] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [edits, setEdits] = useState(0)
  const active = useActiveEditor()
  const id = useId()
  const { db, book, plan, codex, chapterId } = source

  // Keeps up with typing and the caret, once they settle.
  useEffect(() => {
    const editor = active?.editor
    if (!open || !editor || editor.isDestroyed) return
    let timer = 0
    const changed = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setEdits((count) => count + 1), SETTLE_MS)
    }
    editor.on("transaction", changed)
    return () => {
      window.clearTimeout(timer)
      editor.off("transaction", changed)
    }
  }, [open, active])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    gather({ db, book, plan, codex, chapterId }, { tool, fields, slotsOff, contextTokens }).then(
      (gathered) => {
        if (cancelled) return
        setPreview(gathered.ok ? { ok: true, prompt: buildPrompt(gathered.input) } : gathered)
      },
      (error: unknown) => {
        if (cancelled) return
        console.error("[context preview]", error)
        setPreview({ ok: false, problem: "The preview couldn't be put together." })
      },
    )
    return () => {
      cancelled = true
    }
  }, [open, db, book, plan, codex, chapterId, tool, fields, slotsOff, contextTokens, edits, active])

  const custom = tool.template !== undefined
  const prompt = preview?.ok ? preview.prompt : null

  return (
    <section className="grid gap-2" aria-label="What the AI sees">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((was) => !was)}
          className={DISCLOSURE}
          data-ai-context-toggle
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-90")}
          />
          What the AI sees
        </button>
        <TermHint term="context" />
      </div>
      {open && (
        <div id={`${id}-body`} className="grid gap-3 rounded-lg border bg-page p-3" data-ai-context>
          {!preview ? (
            <p className="text-sm text-muted-foreground">Putting it together…</p>
          ) : !prompt ? (
            <p className="text-sm text-muted-foreground">{!preview.ok && preview.problem}</p>
          ) : (
            <>
              <ul className="grid gap-1" aria-label="What it sends">
                {prompt.slots.map((slot) => {
                  const boxId = `${id}-${slot.id}`
                  const detail = slotDetail(slot)
                  return (
                    <li
                      key={slot.id}
                      className="flex min-h-6 items-center gap-2 pointer-coarse:min-h-11"
                      data-ai-slot={slot.id}
                    >
                      <Checkbox
                        id={boxId}
                        checked={custom ? slot.used : !slot.off}
                        disabled={custom || slot.locked}
                        onCheckedChange={(checked) => setSlot(slot.id, checked === true)}
                        aria-describedby={`${boxId}-detail`}
                      />
                      <Label htmlFor={boxId} className="min-w-0 flex-1 font-normal">
                        {slot.label}
                      </Label>
                      <span id={`${boxId}-detail`} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {detail}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {custom ? (
                <p className="text-xs text-muted-foreground">Your own tools send what their prompt asks for.</p>
              ) : (
                <p className="text-xs text-muted-foreground">The ones you can't untick go with every request.</p>
              )}
              <p className="text-sm text-ink-2" data-ai-context-total>
                {formatTokens(prompt.tokens)} of the {formatTokens(prompt.budget)} tokens it can send
              </p>
              {prompt.tooBig && <p className="text-sm text-destructive">{TOO_BIG}</p>}
              <div className="grid gap-2">
                <button
                  type="button"
                  aria-expanded={showPrompt}
                  aria-controls={`${id}-prompt`}
                  onClick={() => setShowPrompt((was) => !was)}
                  className={DISCLOSURE}
                >
                  <ChevronRightIcon
                    aria-hidden="true"
                    className={cn(
                      "size-4 transition-transform motion-reduce:transition-none",
                      showPrompt && "rotate-90",
                    )}
                  />
                  The whole prompt
                </button>
                {showPrompt && (
                  <pre
                    id={`${id}-prompt`}
                    tabIndex={0}
                    aria-label="The whole prompt"
                    className="max-h-80 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {`${prompt.system}\n\n${prompt.user}`}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
