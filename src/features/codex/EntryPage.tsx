import { usePowerSync } from "@powersync/react"
import { CheckIcon, ChevronLeftIcon, EllipsisIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react"
import { Fragment, useId, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { attempt, offerUndo } from "@/app/feedback"
import { ChipsInput } from "@/components/ChipsInput"
import { DraftInput, DraftTextarea } from "@/components/DraftField"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAfterMenu } from "@/components/useAfterMenu"
import { chapterTitle } from "@/features/plan/status"
import { writePath, type WriteNavState } from "@/features/write/writeContext"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { colorName, PALETTE, textOn } from "@/lib/palette"
import { cn } from "@/lib/utils"
import { PLAN_ROLES, type Appearance } from "./appearances"
import {
  AI_CONTEXTS,
  codexPath,
  entryFieldLabels,
  fieldValue,
  isTracked,
  sharedTerms,
  UNNAMED_ENTRY,
  type Codex,
  type CodexEntry,
  type CodexType,
  type SharedTerm,
} from "./codexData"
import { Portrait, TypeIcon } from "./CodexIcons"
import { nounOf, removedFieldMessage, type BackLink } from "./screenRules"
import {
  addTypeField,
  removeEntryField,
  removeTypeField,
  setEntryField,
  updateEntry,
  type EntryPatch,
} from "./mutations"
import type { Appearances } from "./useAppearances"

/** The Type picker's value for an entry whose type is gone (a Select item can't have ""). */
const NO_TYPE_VALUE = "*none*"

/** Appears-in links land on the chapter's heading. */
const HEADING_STATE: WriteNavState = { focus: "heading" }

const ROLE_LABELS = new Map(PLAN_ROLES.map(({ role, label }) => [role, label]))

const LIST_FORMAT = new Intl.ListFormat("en", { style: "long", type: "conjunction" })

interface EntryPageProps {
  bookId: string
  codex: Codex
  entry: CodexEntry
  appearances: Appearances
  /** On phones, where the entry replaces the list. */
  back: BackLink | null
  onTrash: (entry: CodexEntry) => void
}

/** An entry's page (DESIGN.md §7): name, type, tags, aliases, AI context, fields, notes and Appears in. */
export function EntryPage({ bookId, codex, entry, appearances, back, onTrash }: EntryPageProps) {
  const db = usePowerSync()
  const id = useId()
  const fieldId = (name: string) => `${id}-${name}`
  const menu = useAfterMenu()
  const type = entry.typeId ? codex.typeById.get(entry.typeId) : undefined
  const tracked = isTracked(codex, entry)
  const shared = useMemo(() => sharedTerms(codex, entry), [codex, entry])
  const aiHint = AI_CONTEXTS.find((option) => option.value === entry.aiContext)?.hint

  const save = (patch: EntryPatch) => updateEntry(db, entry.id, patch)
  const saveNow = (context: string, patch: EntryPatch) => void attempt(context, save(patch))

  return (
    <article data-codex-entry={entry.id} data-tour="world-entry" className="mx-auto w-full max-w-2xl px-5 pt-6 pb-24 md:px-8">
      {back && (
        <Link to={back.to} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 mb-3 text-ink-2")}>
          <ChevronLeftIcon />
          {back.label}
        </Link>
      )}
      <header className="flex items-start gap-4">
        <ColorButton entry={entry} onPick={(color) => saveNow("save color", { color })} />
        <div className="min-w-0 flex-1 pt-1">
          <h2
            tabIndex={-1}
            data-codex-heading={entry.id}
            className="w-fit rounded-sm text-xs font-semibold tracking-widest text-muted-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span aria-hidden="true">{type?.singular ?? "No type"}</span>
            <span className="sr-only">
              {type?.singular ?? "No type"}: {entry.name}
            </span>
          </h2>
          <DraftInput
            data-codex-name={entry.id}
            aria-label="Name"
            placeholder={UNNAMED_ENTRY}
            value={entry.named ? entry.name : ""}
            onSave={(name) => save({ name })}
            className="-mx-2 h-auto w-[calc(100%+1rem)] border-transparent bg-transparent px-2 py-1 font-heading text-2xl leading-tight font-semibold shadow-none hover:border-input md:text-2xl dark:bg-transparent"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More for this entry" className="shrink-0 text-muted-foreground">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={menu.onCloseAutoFocus}>
            <DropdownMenuItem variant="destructive" onSelect={() => menu.after(() => onTrash(entry))}>
              <Trash2Icon />
              Move to Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mt-6 grid gap-6">
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
          <Label htmlFor={fieldId("type")} className="text-ink-2">
            Type
          </Label>
          <Select
            value={type?.id ?? NO_TYPE_VALUE}
            onValueChange={(value) => saveNow("save type", { typeId: value === NO_TYPE_VALUE ? null : value })}
          >
            <SelectTrigger id={fieldId("type")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {codex.types.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <TypeIcon icon={option.icon} className="text-muted-foreground" />
                  {option.singular}
                </SelectItem>
              ))}
              {!type && (
                <SelectItem value={NO_TYPE_VALUE}>
                  <TypeIcon icon={null} className="text-muted-foreground" />
                  No type
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          <Label htmlFor={fieldId("tags")} className="self-start pt-2 text-ink-2">
            Tags
          </Label>
          <ChipsInput
            id={fieldId("tags")}
            noun="tag"
            placeholder="Add a tag…"
            values={entry.tags}
            suggestions={codex.tags}
            onChange={(tags) => save({ tags })}
          />

          <Label htmlFor={fieldId("aliases")} className="self-start pt-2 text-ink-2">
            Aliases
          </Label>
          <div className="grid gap-1.5">
            <ChipsInput
              id={fieldId("aliases")}
              noun="alias"
              placeholder="Other names, like “the Captain”…"
              values={entry.aliases}
              aria-describedby={[fieldId("aliases-help"), shared.length > 0 ? fieldId("shared") : ""].join(" ").trim()}
              onChange={(aliases) => save({ aliases })}
            />
            <p id={fieldId("aliases-help")} className="text-xs text-muted-foreground">
              {tracked
                ? "The text underlines these as well as the name, and Appears in counts them."
                : `${type?.name ?? "These"} aren't underlined in the text, since their names are often ordinary words.`}
            </p>
            {shared.length > 0 && <SharedNames id={fieldId("shared")} bookId={bookId} shared={shared} />}
          </div>

          {/* Phones put the three options under the label, where they fit. */}
          <span id={fieldId("ai-label")} className="col-span-2 text-ink-2 sm:col-span-1 sm:self-start sm:pt-1.5">
            AI context
          </span>
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              aria-labelledby={fieldId("ai-label")}
              aria-describedby={fieldId("ai-help")}
              value={entry.aiContext}
              onValueChange={(value) => {
                const option = AI_CONTEXTS.find((candidate) => candidate.value === value)
                if (option) saveNow("save AI context", { aiContext: option.value })
              }}
              className="w-full"
            >
              {AI_CONTEXTS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p id={fieldId("ai-help")} className="text-xs text-muted-foreground">
              {aiHint}
            </p>
          </div>
        </div>

        <Section title="Details" labelId={fieldId("details")}>
          <EntryFields entry={entry} type={type} baseId={fieldId("field")} />
        </Section>

        <Section title="Notes" htmlFor={fieldId("notes")}>
          <DraftTextarea
            id={fieldId("notes")}
            placeholder="Backstory, research, anything."
            value={entry.notes}
            onSave={(notes) => save({ notes })}
            className="min-h-28"
          />
        </Section>

        <Section title="Appears in" labelId={fieldId("appears")}>
          <AppearsIn
            bookId={bookId}
            type={type}
            tracked={tracked}
            list={appearances.byEntry.get(entry.id) ?? []}
            appearances={appearances}
            labelId={fieldId("appears")}
          />
        </Section>
      </div>
    </article>
  )
}

function Section({
  title,
  htmlFor,
  labelId,
  children,
}: {
  title: string
  htmlFor?: string
  labelId?: string
  children: ReactNode
}) {
  const className = "text-xs font-semibold tracking-wide text-muted-foreground uppercase"
  return (
    <section className="grid gap-2">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className={className}>
          {title}
        </Label>
      ) : (
        <h3 id={labelId} className={className}>
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}

/** The entry's color, shown as its portrait; a click offers the palette. */
function ColorButton({ entry, onPick }: { entry: CodexEntry; onPick: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const current = PALETTE.find((color) => color === entry.color.toUpperCase()) ?? ""
  const name = colorName(entry.color)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Over the portrait rather than around it, so the initials aren't read as the button's label. */}
      <div className="relative shrink-0">
        <Portrait entry={entry} className="size-14 font-heading text-lg" />
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={name ? `Color: ${name}` : "Color"}
            className="absolute inset-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" aria-labelledby={labelId} className="w-auto">
        <p id={labelId} className="text-xs font-medium text-ink-2">
          Color
        </p>
        <ToggleGroup
          type="single"
          aria-labelledby={labelId}
          value={current}
          onValueChange={(color) => {
            if (!color) return
            onPick(color)
            setOpen(false)
          }}
          className="grid grid-cols-5 gap-1.5"
        >
          {PALETTE.map((color) => (
            <ToggleGroupItem
              key={color}
              value={color}
              aria-label={colorName(color) ?? color}
              className="size-8 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-ink data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-popover"
              style={{ background: color, color: textOn(color) }}
            >
              {color === current && <CheckIcon />}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  )
}

/** “Wren” is also a name of Wren Hollow, so neither is underlined: with links to the others. */
function SharedNames({ id, bookId, shared }: { id: string; bookId: string; shared: readonly SharedTerm[] }) {
  return (
    <div id={id} className="grid gap-1">
      {shared.map(({ term, others }) => (
        <p key={term} className="flex gap-1.5 text-xs text-ink-2">
          <TriangleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0 text-status-drafting" />
          <span>
            “{term}” is also a name of{" "}
            {LIST_FORMAT.formatToParts(others.map((other) => other.id)).map((part, index) =>
              part.type === "literal" ? (
                part.value
              ) : (
                <Link
                  key={index}
                  to={codexPath(bookId, part.value)}
                  className="font-medium text-ink underline underline-offset-2"
                >
                  {others.find((other) => other.id === part.value)?.name}
                </Link>
              ),
            )}
            , so {others.length === 1 ? "neither is" : "none of them is"} underlined.
          </span>
        </p>
      ))}
    </div>
  )
}

/** The type's fields, then the entry's own, each removable, and a form to add one. */
function EntryFields({ entry, type, baseId }: { entry: CodexEntry; type: CodexType | undefined; baseId: string }) {
  const db = usePowerSync()
  const labels = entryFieldLabels(entry, type)
  const typeFields = new Set(type?.fields)

  const remove = async (label: string, index: number) => {
    const next = labels[index + 1] ?? labels[index - 1]
    // Only while this entry is still open: elsewhere the same label could be another entry's field.
    const refocus = () => {
      if (document.querySelector(byData("codex-entry", entry.id))) focusSoon(byData("codex-field", label))
    }
    if (type && typeFields.has(label)) {
      const removed = await attempt("remove field", removeTypeField(db, type.id, label, entry.id))
      if (!removed) return
      offerUndo(db, removedFieldMessage(label, type.name, removed.kept), removed.changes, refocus)
    } else {
      const changes = await attempt("remove field", removeEntryField(db, entry.id, label))
      if (!changes) return
      offerUndo(db, `Removed “${label}”`, changes, refocus)
    }
    focusSoon(next ? byData("codex-field", next) : "[data-codex-add-field]")
  }

  return (
    <div className="grid gap-3">
      {labels.length > 0 ? (
        labels.map((label, index) => {
          const inputId = `${baseId}-${index}`
          const removeLabel = type && typeFields.has(label) ? `Remove “${label}” from ${type.name}` : `Remove “${label}”`
          return (
            <div key={label} className="group/field grid gap-1">
              <div className="flex items-center gap-1">
                <Label htmlFor={inputId} className="min-w-0 break-words text-ink-2">
                  {label}
                </Label>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={removeLabel}
                  title={removeLabel}
                  onClick={() => void remove(label, index)}
                  className="ml-auto text-muted-foreground opacity-0 group-focus-within/field:opacity-100 group-hover/field:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                >
                  <XIcon />
                </Button>
              </div>
              <DraftTextarea
                id={inputId}
                data-codex-field={label}
                value={fieldValue(entry, label)}
                onSave={(value) => setEntryField(db, entry.id, label, value)}
                className="min-h-9 pointer-coarse:min-h-11"
              />
            </div>
          )
        })
      ) : (
        <p className="text-sm text-muted-foreground">No fields yet. Add one for each thing worth keeping track of.</p>
      )}
      <AddField entry={entry} type={type} labels={labels} />
    </div>
  )
}

function AddField({ entry, type, labels }: { entry: CodexEntry; type: CodexType | undefined; labels: string[] }) {
  const db = usePowerSync()
  const checkboxId = useId()
  const [label, setLabel] = useState("")
  const [everywhere, setEverywhere] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = label.trim()
    if (!name || busy) return
    const existing = labels.find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    if (existing) {
      setLabel("")
      toast(`There's a “${existing}” field already.`)
      focusSoon(byData("codex-field", existing))
      return
    }
    setBusy(true)
    const added =
      type && everywhere
        ? await attempt("add field", addTypeField(db, type.id, name))
        : await attempt("add field", setEntryField(db, entry.id, name, "").then(() => true))
    setBusy(false)
    if (!added) return
    setLabel("")
    focusSoon(byData("codex-field", name))
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Input
        data-codex-add-field
        aria-label="New field"
        placeholder="New field, like Birthplace"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        className="w-56 max-w-full"
      />
      {type && (
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox
            id={checkboxId}
            checked={everywhere}
            onCheckedChange={(checked) => setEverywhere(checked === true)}
          />
          <Label htmlFor={checkboxId} className="font-normal text-ink-2">
            Add to every {nounOf(type.singular)}
          </Label>
        </div>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        <PlusIcon />
        Add field
      </Button>
    </form>
  )
}

function AppearsIn({
  bookId,
  type,
  tracked,
  list,
  appearances,
  labelId,
}: {
  bookId: string
  type: CodexType | undefined
  tracked: boolean
  list: readonly Appearance[]
  appearances: Appearances
  labelId: string
}) {
  let note: string | null = null
  if (!tracked) {
    const kind = type?.name ?? "These"
    note = `${list.length === 0 ? "Not linked from the plan yet. " : ""}${kind} aren't looked for in the text, so only the plan's links count.`
  } else if (appearances.failed) {
    note = "Couldn't count mentions in the text, so only the plan's links are listed."
  } else if (!appearances.counted) {
    note = "Counting mentions…"
  } else if (list.length === 0) {
    note = "Not in the book yet. Chapters that mention it, or link it in the plan, show up here."
  }

  return (
    <div className="grid gap-2">
      {list.length > 0 && (
        <ol aria-labelledby={labelId} className="-mx-2 grid gap-0.5">
          {list.map((appearance) => {
            const title = chapterTitle(appearance.title)
            const roles = appearance.roles.map((role) => ROLE_LABELS.get(role) ?? role)
            const count = appearance.mentions
            const mentions = count > 0 ? `${formatCount(count)} ${count === 1 ? "mention" : "mentions"}` : null
            return (
              <li key={appearance.chapterId}>
                <Link
                  to={writePath(bookId, appearance.chapterId)}
                  state={HEADING_STATE}
                  aria-label={[`Chapter ${appearance.number}: ${title}`, ...roles, ...(mentions ? [mentions] : [])].join(", ")}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  )}
                >
                  <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {appearance.number}
                  </span>{" "}
                  <span className={cn("min-w-0 flex-1 truncate", !appearance.title && "text-muted-foreground italic")}>
                    {title}
                  </span>
                  {roles.map((role) => (
                    <Fragment key={role}>
                      {" "}
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[0.6875rem] font-medium text-ink-2">
                        {role}
                      </span>
                    </Fragment>
                  ))}
                  {mentions && (
                    <>
                      {" "}
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{mentions}</span>
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ol>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}
