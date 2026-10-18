import { DownloadIcon, FileUpIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { useAfterMenu } from "@/components/useAfterMenu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { downloadFile } from "@/export/download"
import { safeFilename } from "@/export/files"
import { setBookStructure } from "@/features/books/mutations"
import { TermHint } from "@/features/help/TermHint"
import { newId } from "@/lib/id"
import { usePlanContext } from "./planContext"
import { createStructure, deleteStructure, updateStructure } from "./structureMutations"
import {
  BUILTIN_STRUCTURES,
  customKey,
  readStructureFile,
  structureFile,
  type StoryStructure,
  type StructureDraft,
} from "./structures"

interface ActDraft {
  id: string
  title: string
  pct: string
}

interface MomentDraft {
  id: string
  key: string
  name: string
  pct: string
  description: string
}

interface EditorState {
  /** The structure being changed; null for a new one. */
  templateId: string | null
  name: string
  acts: ActDraft[]
  beats: MomentDraft[]
}

const blankMoment = (pct = 0): MomentDraft => ({ id: newId(), key: "", name: "", pct: String(pct), description: "" })

const blankEditor = (): EditorState => ({ templateId: null, name: "", acts: [], beats: [blankMoment()] })

function editorFor(structure: StoryStructure, copy: boolean): EditorState {
  return {
    templateId: copy ? null : (structure.templateId ?? null),
    name: copy ? `${structure.name} (copy)` : structure.name,
    acts: structure.acts.map((act) => ({ id: newId(), title: act.title, pct: String(act.pct) })),
    // A copy keeps the moments' keys, so chapters marked with the original read the same with the copy.
    beats: structure.beats.map((item) => ({ ...item, id: newId(), pct: String(item.pct) })),
  }
}

const draftOf = (state: EditorState): StructureDraft => ({
  name: state.name,
  acts: state.acts.map((act) => ({ title: act.title, pct: Number(act.pct) || 0 })),
  beats: state.beats.map((item) => ({
    key: item.key,
    name: item.name,
    pct: Number(item.pct) || 0,
    description: item.description,
  })),
})

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The writer's own story structures (DESIGN.md §6 "Templates"): make, change, share and delete them. */
export function StructuresDialog() {
  const [editor, setEditor] = useState<EditorState | null>(null)
  // What the list focuses once it shows again: a structure's Change button, or New structure.
  const [focusAfter, setFocusAfter] = useState<string | null>(null)
  if (editor) {
    return (
      <StructureEditor
        initial={editor}
        onDone={(id) => {
          setFocusAfter(id ? `[data-structure-edit="${id}"]` : "[data-structure-new]")
          setEditor(null)
        }}
      />
    )
  }
  return <StructureList onEdit={setEditor} initialFocus={focusAfter} />
}

function StructureList({
  onEdit,
  initialFocus,
}: {
  onEdit: (editor: EditorState) => void
  initialFocus: string | null
}) {
  const { db, structures } = usePlanContext()
  const { custom, current } = structures
  const fileInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // On opening, the first structure, else New structure.
  const focusAfter = useRef<string | null>(initialFocus ?? "[data-structure-edit], [data-structure-new]")
  const [error, setError] = useState<string | null>(null)
  const { after, onCloseAutoFocus } = useAfterMenu()

  // A structure just saved may only reach the list a moment later.
  useEffect(() => {
    const selector = focusAfter.current
    const target = selector ? list.current?.querySelector<HTMLElement>(selector) : null
    if (!target) return
    focusAfter.current = null
    target.focus()
  }, [custom])

  const exportStructure = (structure: StoryStructure) => {
    downloadFile({
      name: `${safeFilename(structure.name, "Story structure")}.json`,
      type: "application/json",
      data: structureFile(structure),
    })
    announce(`Saved “${structure.name}” as a file`)
  }

  const remove = async (structure: StoryStructure, index: number) => {
    setError(null)
    const changes = await attempt("delete structure", deleteStructure(db, structure.templateId!))
    if (!changes) return
    const next = custom[index + 1] ?? custom[index - 1]
    list.current
      ?.querySelector<HTMLElement>(next ? `[data-structure-edit="${next.templateId}"]` : "[data-structure-new]")
      ?.focus()
    offerUndo(db, `Deleted “${structure.name}”`, changes, () => {
      const selector = `[data-structure-edit="${structure.templateId}"]`
      const restored = list.current?.querySelector<HTMLElement>(selector)
      if (restored) restored.focus()
      else focusAfter.current = selector
    })
  }

  const importFile = async (file: File) => {
    setError(null)
    let draft: StructureDraft
    try {
      draft = await readStructureFile(file)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That file couldn't be read.")
      return
    }
    const saved = await attempt("import structure", createStructure(db, draft))
    if (!saved) return
    focusAfter.current = `[data-structure-edit="${saved.id}"]`
    announce(`Added “${saved.name}”`)
  }

  return (
    <div ref={list} className="grid min-h-0 gap-4">
      <DialogHeader>
        <div className="flex items-center gap-1">
          <DialogTitle>Your story structures</DialogTitle>
          <TermHint term="story-structure" />
        </div>
        <DialogDescription>
          Make a structure of your own, or change a copy of a built-in one. Every book can use them: choose one from
          the Structure menu.
        </DialogDescription>
      </DialogHeader>
      {custom.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-ink-2">
          You haven't made one yet.
        </p>
      ) : (
        <ul className="divide-y overflow-y-auto rounded-lg border" aria-label="Your story structures">
          {custom.map((structure, index) => (
            <li
              key={structure.key}
              className="flex items-center gap-1 py-1.5 pr-1.5 pl-3"
              data-structure={structure.key}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{structure.name}</p>
                <p className="text-xs text-ink-2">
                  {count(structure.beats.length, "moment", "moments")}
                  {structure.acts.length > 0 && `, ${count(structure.acts.length, "act", "acts")}`}
                  {current?.key === structure.key && " · This book follows it"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                data-structure-edit={structure.templateId}
                aria-label={`Change “${structure.name}”`}
                onClick={() => onEdit(editorFor(structure, false))}
              >
                <PencilIcon />
                <span className="hidden sm:inline">Change</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Save “${structure.name}” as a file`}
                title="Save as a file, to share or keep"
                onClick={() => exportStructure(structure)}
              >
                <DownloadIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete “${structure.name}”`}
                title="Delete"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void remove(structure, index)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
          <FileUpIcon />
          Open a structure file…
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" data-structure-new>
              <PlusIcon />
              New structure
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72" onCloseAutoFocus={onCloseAutoFocus}>
            <DropdownMenuItem onSelect={() => after(() => onEdit(blankEditor()))}>Start from nothing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Start from a copy of</DropdownMenuLabel>
            {[...BUILTIN_STRUCTURES, ...custom].map((structure) => (
              <DropdownMenuItem key={structure.key} onSelect={() => after(() => onEdit(editorFor(structure, true)))}>
                {structure.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </DialogFooter>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void importFile(file)
        }}
      />
    </div>
  )
}

function StructureEditor({ initial, onDone }: { initial: EditorState; onDone: (id: string | null) => void }) {
  const { db, bookId } = usePlanContext()
  const id = useId()
  const [state, setState] = useState(initial)
  const [useIt, setUseIt] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The field to focus once a row added or removed has rendered.
  const focusNext = useRef<string | null>(null)
  const isNew = state.templateId === null

  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  const update = (patch: Partial<EditorState>) => setState((before) => ({ ...before, ...patch }))
  const field = (kind: "act" | "moment", rowId: string, part: string) => `${id}-${kind}-${rowId}-${part}`

  const setMoment = (rowId: string, patch: Partial<MomentDraft>) =>
    update({ beats: state.beats.map((item) => (item.id === rowId ? { ...item, ...patch } : item)) })
  const setAct = (rowId: string, patch: Partial<ActDraft>) =>
    update({ acts: state.acts.map((act) => (act.id === rowId ? { ...act, ...patch } : act)) })

  const addMoment = () => {
    const last = Number(state.beats.at(-1)?.pct ?? -5) || 0
    const moment = blankMoment(Math.min(100, last + 5))
    update({ beats: [...state.beats, moment] })
    focusNext.current = field("moment", moment.id, "name")
  }
  const removeMoment = (index: number) => {
    const rest = state.beats.filter((_, place) => place !== index)
    update({ beats: rest })
    const next = rest[index] ?? rest[index - 1]
    focusNext.current = next ? field("moment", next.id, "name") : `${id}-add-moment`
  }
  const addAct = () => {
    const last = Number(state.acts.at(-1)?.pct ?? -25) || 0
    const act = { id: newId(), title: "", pct: String(Math.min(100, last + 25)) }
    update({ acts: [...state.acts, act] })
    focusNext.current = field("act", act.id, "title")
  }
  const removeAct = (index: number) => {
    const rest = state.acts.filter((_, place) => place !== index)
    update({ acts: rest })
    const next = rest[index] ?? rest[index - 1]
    focusNext.current = next ? field("act", next.id, "title") : `${id}-add-act`
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!state.beats.some((item) => item.name.trim())) {
      setError("Give at least one moment a name.")
      const first = state.beats[0]
      focusNext.current = first ? field("moment", first.id, "name") : `${id}-add-moment`
      return
    }
    setBusy(true)
    const draft = draftOf(state)
    const saved = await attempt(
      "save structure",
      state.templateId
        ? updateStructure(db, state.templateId, draft).then((name) => ({ id: state.templateId!, name }))
        : createStructure(db, draft),
    )
    setBusy(false)
    if (!saved) return
    if (isNew && useIt) {
      await attempt("set story structure", setBookStructure(db, bookId, customKey(saved.id)))
      announce(`Saved “${saved.name}”. This book follows it now.`)
    } else {
      announce(`Saved “${saved.name}”`)
    }
    onDone(saved.id)
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid min-h-0 gap-4" data-structure-editor>
      <DialogHeader>
        <DialogTitle>{isNew ? "New story structure" : "Change your structure"}</DialogTitle>
        <DialogDescription>
          A structure is a list of moments, the turning points it expects, each with how far through the book it
          comes. Acts are optional. Both are put in order when you save.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={state.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Untitled structure"
          autoComplete="off"
          autoFocus
        />
      </div>

      <section className="grid gap-2" aria-labelledby={`${id}-moments`}>
        <div className="flex items-center gap-1">
          <h3 id={`${id}-moments`} className="font-medium">
            Moments
          </h3>
          <TermHint term="structure-moment" />
        </div>
        <p className="text-xs text-ink-2">
          The number is how far through the book the moment comes: 0% is the first page, 50% the middle, 100% the
          end.
        </p>
        <ol className="grid gap-3">
          {state.beats.map((item, index) => {
            const label = `Moment ${index + 1}${item.name.trim() ? ` (${item.name.trim()})` : ""}`
            return (
              <li key={item.id} className="grid gap-1.5 rounded-lg border p-2" data-structure-moment>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="w-5 shrink-0 text-right text-xs text-ink-2 tabular-nums">
                    {index + 1}.
                  </span>
                  <Input
                    id={field("moment", item.id, "name")}
                    aria-label={`Moment ${index + 1} name`}
                    value={item.name}
                    onChange={(event) => setMoment(item.id, { name: event.target.value })}
                    placeholder="Name, like “Midpoint”"
                    autoComplete="off"
                    className="min-w-0 flex-1"
                  />
                  <PercentInput
                    id={field("moment", item.id, "pct")}
                    label={`${label}: how far through the book, in percent`}
                    value={item.pct}
                    onChange={(pct) => setMoment(item.id, { pct })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label}`}
                    title="Remove"
                    onClick={() => removeMoment(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <Textarea
                  aria-label={`${label}: what happens`}
                  value={item.description}
                  onChange={(event) => setMoment(item.id, { description: event.target.value })}
                  placeholder="What happens at this moment (optional)"
                  rows={1}
                  className="min-h-9"
                />
              </li>
            )
          })}
        </ol>
        <Button
          id={`${id}-add-moment`}
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={addMoment}
        >
          <PlusIcon />
          Add a moment
        </Button>
      </section>

      <section className="grid gap-2" aria-labelledby={`${id}-acts`}>
        <div className="flex items-center gap-1">
          <h3 id={`${id}-acts`} className="font-medium">
            Acts <span className="font-normal text-ink-2">(optional)</span>
          </h3>
          <TermHint term="act" />
        </div>
        {state.acts.length > 0 && (
          <ol className="grid gap-2">
            {state.acts.map((act, index) => {
              const label = `Act ${index + 1}${act.title.trim() ? ` (${act.title.trim()})` : ""}`
              return (
                <li key={act.id} className="flex items-center gap-2" data-structure-act>
                  <Input
                    id={field("act", act.id, "title")}
                    aria-label={`Act ${index + 1} title`}
                    value={act.title}
                    onChange={(event) => setAct(act.id, { title: event.target.value })}
                    placeholder="Title, like “Act II — Confrontation”"
                    autoComplete="off"
                    className="min-w-0 flex-1"
                  />
                  <PercentInput
                    id={field("act", act.id, "pct")}
                    label={`${label}: where it starts, in percent through the book`}
                    value={act.pct}
                    onChange={(pct) => setAct(act.id, { pct })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label}`}
                    title="Remove"
                    onClick={() => removeAct(index)}
                  >
                    <XIcon />
                  </Button>
                </li>
              )
            })}
          </ol>
        )}
        <Button
          id={`${id}-add-act`}
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={addAct}
        >
          <PlusIcon />
          Add an act
        </Button>
      </section>

      {isNew && (
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox id={`${id}-use`} checked={useIt} onCheckedChange={(checked) => setUseIt(checked === true)} />
          <Label htmlFor={`${id}-use`} className="font-normal">
            Use it for this book
          </Label>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(state.templateId)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save structure
        </Button>
      </DialogFooter>
    </form>
  )
}

/** A 0–100 number with a "%" after it. */
function PercentInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={1}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-18 text-right tabular-nums"
      />
      <span aria-hidden className="text-ink-2">
        %
      </span>
    </div>
  )
}
