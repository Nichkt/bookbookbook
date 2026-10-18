import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useId, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { unknownPlaceholders } from "@/ai/context"
import { createCustomTool, deleteCustomTool, updateCustomTool } from "@/ai/customTools"
import { customTool, isOutputMode, OUTPUT_MODES, PLACEHOLDERS, type CustomToolRow, type OutputMode } from "@/ai/tools"
import { TermHint } from "@/features/help/TermHint"
import { byData, focusSoon } from "@/lib/focus"
import { useWrite } from "../writeContext"
import { closeAiDialog, returnFromAiDialog, useAiDialogs } from "./aiState"
import { useCustomTools, useToolChoice } from "./useAi"

const RADIO_CARD =
  "flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
const NEW_TOOL = "[data-custom-tool-new]"

const MODE_HINTS: Record<OutputMode, string> = {
  variants: "Two to pick from. They replace your selection if the prompt has {selection}, else go in at your cursor.",
  list: "A list of ideas, to copy, or add as moments or to your World.",
  long: "One longer piece, up to about 2,000 words, to put in at your cursor.",
}

/** The writer's own tools (DESIGN.md §9 "Custom tools"): a list to edit them from, and the form for one. */
export function CustomToolsDialog() {
  const open = useAiDialogs((state) => state.open === "tools")
  const session = useAiDialogs((state) => state.session)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAiDialog()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (returnFromAiDialog()) event.preventDefault()
        }}
      >
        <ToolsBody key={session} />
      </DialogContent>
    </Dialog>
  )
}

function ToolsBody() {
  const { db } = useWrite()
  const custom = useCustomTools()
  const { setTool } = useToolChoice(custom.tools)
  const id = useId()
  /** The tool being edited; `{ id: null }` for a new one, null for the list. */
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)

  if (editing) {
    const row = editing.id ? custom.rows.find((candidate) => candidate.id === editing.id) : undefined
    const back = (savedId: string | null) => {
      setEditing(null)
      const to = savedId ?? editing.id
      focusSoon(to ? byData("custom-tool-edit", to) : NEW_TOOL)
    }
    return (
      <ToolForm
        row={row}
        onSaved={(savedId, created) => {
          if (created) setTool(`custom:${savedId}`)
          back(savedId)
        }}
        onCancel={() => back(null)}
      />
    )
  }

  const remove = async (row: CustomToolRow) => {
    const index = custom.rows.findIndex((candidate) => candidate.id === row.id)
    const next = custom.rows[index + 1] ?? custom.rows[index - 1]
    const changes = await attempt("delete custom tool", deleteCustomTool(db, row.id))
    if (!changes) return
    offerUndo(db, `Deleted “${customTool(row).name}”.`, changes)
    focusSoon(next ? byData("custom-tool-edit", next.id) : NEW_TOOL)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Your own tools</DialogTitle>
        <DialogDescription>
          A prompt you write once and run from the AI tools like the others. The app fills in the parts in braces,
          like {"{selection}"}, from your text and your book.
        </DialogDescription>
      </DialogHeader>
      {custom.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : custom.rows.length === 0 ? (
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          You haven't made any yet.
          <TermHint term="custom-tool" />
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" aria-label="Your tools">
          {custom.rows.map((row) => {
            const tool = customTool(row)
            const nameId = `${id}-${row.id}`
            return (
              <li key={row.id} className="flex items-center gap-1 py-1.5 pr-1.5 pl-3" data-custom-tool={row.id}>
                <div className="min-w-0 flex-1">
                  <p id={nameId} className="truncate text-sm font-medium">
                    {tool.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{tool.blurb}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit"
                      aria-describedby={nameId}
                      data-custom-tool-edit={row.id}
                      onClick={() => setEditing({ id: row.id })}
                      className="text-muted-foreground"
                    >
                      <PencilIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete"
                      aria-describedby={nameId}
                      onClick={() => void remove(row)}
                      className="text-muted-foreground"
                    >
                      <Trash2Icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" data-custom-tool-new onClick={() => setEditing({ id: null })}>
          <PlusIcon />
          New tool
        </Button>
        <DialogClose asChild>
          <Button type="button">Done</Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}

interface ToolFormProps {
  /** The tool to edit; none for a new one. */
  row?: CustomToolRow
  onSaved: (id: string, created: boolean) => void
  onCancel: () => void
}

function ToolForm({ row, onSaved, onCancel }: ToolFormProps) {
  const { db } = useWrite()
  const id = useId()
  const [name, setName] = useState(row?.name ?? "")
  const [template, setTemplate] = useState(row?.prompt_template ?? "")
  const [mode, setMode] = useState<OutputMode>(isOutputMode(row?.output_mode) ? row.output_mode : "variants")
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const unknown = unknownPlaceholders(template)
  const nameMissing = tried && !name.trim()
  const promptMissing = tried && !template.trim()
  const promptNotes = [promptMissing && `${id}-prompt-error`, unknown.length > 0 && `${id}-unknown`]
    .filter(Boolean)
    .join(" ")

  /** Puts a placeholder in at the prompt's caret, and goes back there. */
  const insert = (placeholder: string) => {
    const text = `{${placeholder}}`
    const box = area.current
    const from = box ? box.selectionStart : template.length
    const to = box ? box.selectionEnd : template.length
    setTemplate(template.slice(0, from) + text + template.slice(to))
    requestAnimationFrame(() => {
      if (!box) return
      box.focus()
      box.setSelectionRange(from + text.length, from + text.length)
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setTried(true)
    if (!name.trim()) {
      announce("Give the tool a name.")
      nameInput.current?.focus()
      return
    }
    if (!template.trim()) {
      announce("Write what the tool should ask for.")
      area.current?.focus()
      return
    }
    setBusy(true)
    const draft = { name, template, mode }
    const savedId = await attempt(
      "save custom tool",
      row ? updateCustomTool(db, row.id, draft).then(() => row.id) : createCustomTool(db, draft),
    )
    setBusy(false)
    if (!savedId) return
    toast(row ? `Saved “${name.trim()}”.` : `Made “${name.trim()}”. It's in the AI tools, ready to run.`)
    onSaved(savedId, !row)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4" data-custom-tool-form>
      <DialogHeader>
        <DialogTitle>{row ? "Edit tool" : "New tool"}</DialogTitle>
        <DialogDescription>
          Ask for what you want in your own words, and put in the parts the app should fill in from your book.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          ref={nameInput}
          id={`${id}-name`}
          autoFocus
          autoComplete="off"
          placeholder="Mara's voice"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameMissing || undefined}
          aria-describedby={nameMissing ? `${id}-name-error` : undefined}
        />
        {nameMissing && (
          <p id={`${id}-name-error`} className="text-sm text-destructive">
            Give the tool a name.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-prompt`}>What it asks the AI</Label>
        <Textarea
          ref={area}
          id={`${id}-prompt`}
          rows={6}
          placeholder="Rewrite {selection} the way Mara would say it: short, dry and a little sad."
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          aria-invalid={promptMissing || undefined}
          aria-describedby={promptNotes || undefined}
          data-custom-tool-prompt
        />
        {promptMissing && (
          <p id={`${id}-prompt-error`} className="text-sm text-destructive">
            Write what the tool should ask for.
          </p>
        )}
        {unknown.length > 0 && (
          <p id={`${id}-unknown`} className="text-xs text-destructive">
            The app can't fill in {unknown.join(", ")}, so the AI will see {unknown.length === 1 ? "it" : "them"} as
            written.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <p id={`${id}-fill`} className="text-sm leading-none font-medium">
          Parts the app fills in
        </p>
        <ul className="grid gap-1" aria-labelledby={`${id}-fill`}>
          {PLACEHOLDERS.map((placeholder) => (
            <li key={placeholder.name} className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="font-mono"
                aria-label={`Insert {${placeholder.name}}`}
                aria-describedby={`${id}-means-${placeholder.name}`}
                onClick={() => insert(placeholder.name)}
              >
                {`{${placeholder.name}}`}
              </Button>
              <span id={`${id}-means-${placeholder.name}`} className="text-muted-foreground">
                {placeholder.means}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <fieldset>
        <legend className="mb-3 text-sm leading-none font-medium">What comes back</legend>
        <div className="grid gap-2">
          {OUTPUT_MODES.map((option) => (
            <label key={option.value} className={RADIO_CARD}>
              <input
                type="radio"
                name={`${id}-mode`}
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                aria-labelledby={`${id}-${option.value}`}
                aria-describedby={`${id}-${option.value}-hint`}
                className="mt-px size-4 shrink-0 accent-primary outline-none"
              />
              <span className="grid gap-1.5">
                <span id={`${id}-${option.value}`} className="text-sm leading-none font-medium">
                  {option.label}
                </span>
                <span id={`${id}-${option.value}-hint`} className="text-xs text-muted-foreground">
                  {MODE_HINTS[option.value]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {row ? "Save" : "Make the tool"}
        </Button>
      </DialogFooter>
    </form>
  )
}
