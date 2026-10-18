import { useId, useState, type FormEvent } from "react"
import { announce } from "@/app/feedback"
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
import type { Codex } from "@/features/codex/codexData"
import { TypeIcon } from "@/features/codex/CodexIcons"
import { TermHint } from "@/features/help/TermHint"
import type { Plan } from "@/features/plan/planData"
import { actLabel, chapterTitle } from "@/features/plan/status"
import { momentsFrom, type FileAs, type FileTarget, type InboxNote } from "./inboxData"

const RADIO_CARD =
  "flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"

const CHAPTER = "chapter:"
const ENTRY = "entry:"

interface FileNoteDialogProps {
  open: boolean
  /** Bumped each time it opens, so the form starts afresh. */
  session: number
  note: InboxNote | null
  plan: Plan
  codex: Codex
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
  /** Files the note, closing the dialog if that worked. */
  onFile: (note: InboxNote, target: FileTarget) => Promise<void>
}

/** Files a note into a chapter's plan or a World entry's notes (DESIGN.md §10, "File to…"). */
export function FileNoteDialog({
  open,
  session,
  note,
  plan,
  codex,
  onClose,
  onCloseAutoFocus,
  onFile,
}: FileNoteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
        data-inbox-file-dialog=""
      >
        {note && <FileForm key={session} note={note} plan={plan} codex={codex} onFile={onFile} />}
      </DialogContent>
    </Dialog>
  )
}

const AS_OPTIONS: readonly { value: FileAs; label: string; hint: (moments: number) => string }[] = [
  { value: "notes", label: "Notes", hint: () => "After the chapter's notes." },
  {
    value: "moments",
    label: "Moments",
    hint: (moments) => `${moments === 1 ? "One moment" : `${moments} moments`}, one for each line, after its last.`,
  },
  { value: "summary", label: "Summary", hint: () => "After the chapter's summary." },
]

function FileForm({ note, plan, codex, onFile }: Pick<FileNoteDialogProps, "plan" | "codex" | "onFile"> & {
  note: InboxNote
}) {
  const id = useId()
  const [where, setWhere] = useState("")
  const [as, setAs] = useState<FileAs>("notes")
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const chapter = where.startsWith(CHAPTER) ? plan.chapterById.get(where.slice(CHAPTER.length)) : undefined
  const entry = where.startsWith(ENTRY) ? codex.entryById.get(where.slice(ENTRY.length)) : undefined
  const moments = momentsFrom(note.text).length
  const types = codex.types.filter((type) => (codex.entriesByType.get(type.id)?.length ?? 0) > 0)
  const untyped = codex.entriesByType.get("") ?? []
  const nowhere = plan.chapters.length === 0 && codex.entries.length === 0
  const showError = tried && !chapter && !entry

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setTried(true)
    if (!chapter && !entry) {
      announce("Choose where to file it.")
      return
    }
    setBusy(true)
    await onFile(note, chapter ? { kind: "chapter", id: chapter.id, as } : { kind: "entry", id: entry?.id ?? "" })
    setBusy(false)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5" data-inbox-file-form="">
      <DialogHeader>
        <div className="flex items-center gap-1">
          <DialogTitle>File this note</DialogTitle>
          <TermHint term="filing" />
        </div>
        <DialogDescription>
          Put it in a chapter's plan or a World entry's notes. It moves to Filed, which says where it went.
        </DialogDescription>
      </DialogHeader>

      <blockquote className="line-clamp-5 border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-ink-2">
        {note.text}
      </blockquote>

      {nowhere ? (
        <p className="text-sm text-ink-2">
          This book has no chapters or World entries yet. Add a chapter on the Plan page, or an entry on the World
          page, then file the note there.
        </p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-where`}>Where</Label>
          <Select
            value={where}
            onValueChange={(next) => {
              setWhere(next)
              setTried(false)
            }}
          >
            <SelectTrigger
              id={`${id}-where`}
              className="w-full"
              aria-invalid={showError || undefined}
              aria-describedby={showError ? `${id}-error` : undefined}
              data-inbox-where=""
            >
              <SelectValue placeholder="Choose a chapter or World entry" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-80">
              {plan.groups.map(
                (group) =>
                  group.chapters.length > 0 && (
                    <SelectGroup key={group.key}>
                      <SelectLabel>{actLabel(group, plan.hasActs)}</SelectLabel>
                      {group.chapters.map((option) => (
                        <SelectItem key={option.id} value={`${CHAPTER}${option.id}`}>
                          Chapter {option.number}: {chapterTitle(option.title)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ),
              )}
              {plan.chapters.length > 0 && codex.entries.length > 0 && <SelectSeparator />}
              {types.map((type) => (
                <SelectGroup key={type.id}>
                  <SelectLabel className="flex items-center gap-1.5">
                    <TypeIcon icon={type.icon} className="size-3.5" />
                    World · {type.name}
                  </SelectLabel>
                  {codex.entriesByType.get(type.id)?.map((option) => (
                    <SelectItem key={option.id} value={`${ENTRY}${option.id}`}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {untyped.length > 0 && (
                <SelectGroup>
                  <SelectLabel>World · No type</SelectLabel>
                  {untyped.map((option) => (
                    <SelectItem key={option.id} value={`${ENTRY}${option.id}`}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {showError && (
            <p id={`${id}-error`} className="text-sm text-destructive">
              Choose where to file it.
            </p>
          )}
          {entry && <p className="text-xs text-muted-foreground">After the entry's notes.</p>}
        </div>
      )}

      {chapter && (
        <fieldset>
          <legend className="mb-3 text-sm leading-none font-medium">Add it to the chapter as</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {AS_OPTIONS.map((option) => (
              <label key={option.value} className={RADIO_CARD}>
                <input
                  type="radio"
                  name={`${id}-as`}
                  value={option.value}
                  checked={as === option.value}
                  onChange={() => setAs(option.value)}
                  aria-labelledby={`${id}-${option.value}`}
                  aria-describedby={`${id}-${option.value}-hint`}
                  data-inbox-as={option.value}
                  className="mt-px size-4 shrink-0 accent-primary outline-none"
                />
                <span className="grid content-start gap-1.5">
                  <span id={`${id}-${option.value}`} className="text-sm leading-none font-medium">
                    {option.label}
                  </span>
                  <span id={`${id}-${option.value}-hint`} className="text-xs text-muted-foreground">
                    {option.hint(moments)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        {!nowhere && (
          <Button type="submit" disabled={busy} data-inbox-file-submit="">
            File note
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}
