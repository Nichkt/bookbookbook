import { usePowerSync } from "@powersync/react"
import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowUpToLineIcon,
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  FolderMinusIcon,
  FolderPlusIcon,
  Undo2Icon,
} from "lucide-react"
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { rememberBook } from "@/app/books"
import { DeferredMenu } from "@/components/DeferredMenu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAfterMenu } from "@/components/useAfterMenu"
import { closeBookDialog, setBookDialogBusy, useBookDialogs } from "@/features/books/dialogStore"
import { UNTITLED_CHAPTER } from "@/features/plan/status"
import { ImportError } from "@/import/errors"
import {
  mergeChapter,
  outlineRows,
  outlineStats,
  removeAct,
  renameAct,
  renameChapter,
  setLeftOut,
  startAct,
  type DraftChapter,
  type MergeDirection,
  type Outline,
} from "@/import/outline"
import { modeKey } from "@/import/split"
import { importBook } from "@/import/write"
import { cn } from "@/lib/utils"
import {
  chapterMeta,
  choiceLabel,
  PARAGRAPHINGS,
  pushDraft,
  reparagraph,
  resplit,
  scenesMatter,
  sourceLabel,
  statsLabel,
  suggestedDetails,
  undoDraft,
  type Draft,
  type History,
} from "./draft"

const IMPORT_FAILED = "Something went wrong, so nothing was imported. Try again?"

/** What the rows can do to the outline. Made once, so a row only draws again when its chapter changes. */
interface RowActions {
  renameChapter: (key: string, title: string) => void
  renameAct: (startKey: string, title: string) => void
  /** Focus goes to the chapter `focusKey`, the one the act's row was over. */
  removeAct: (startKey: string, focusKey: string) => void
  startAct: (key: string) => void
  setLeftOut: (key: string, leftOut: boolean) => void
  /** Focus goes to the menu of `targetKey`, the chapter merged into. */
  merge: (key: string, direction: MergeDirection, targetKey: string) => void
  /** A field lost focus: typing there again is a new step for Undo. */
  endTyping: () => void
}

const TITLE_INPUTS = "[data-act-title], [data-chapter-title]"

/** Enter in a title goes on to the next, as renaming chapters is usually renaming several, rather than importing. */
function nextTitleOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return
  event.preventDefault()
  const inputs = Array.from(event.currentTarget.closest("ul")?.querySelectorAll<HTMLInputElement>(TITLE_INPUTS) ?? [])
  inputs[inputs.indexOf(event.currentTarget) + 1]?.focus()
}

interface ImportPreviewProps {
  initial: Draft
  onBack: () => void
}

/**
 * The book an import will make (DESIGN.md §13): where chapters start, and the chapters and acts that makes, to
 * rename, merge, leave out or group into acts first. Every change can be undone.
 */
export function ImportPreview({ initial, onBack }: ImportPreviewProps) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const id = useId()
  const [history, setHistory] = useState<History>({ draft: initial, past: [] })
  const [details, setDetails] = useState(() => suggestedDetails(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importing = useRef(false)
  // The field being typed in, whose changes Undo takes back together.
  const typing = useRef<string | null>(null)
  // What to focus once a change is drawn, when the change took away or added what had focus.
  const pendingFocus = useRef<string | null>(null)

  const { source, analysis, settings, outline } = history.draft
  const rows = useMemo(() => outlineRows(outline), [outline])
  const stats = useMemo(() => outlineStats(outline), [outline])
  const offerScenes = useMemo(() => scenesMatter({ source, analysis, settings }), [source, analysis, settings])
  const canUndo = history.past.length > 0

  // Before paint rather than after, so it's here before the dialog's focus trap sees focus gone with a removed row.
  useLayoutEffect(() => {
    const selector = pendingFocus.current
    if (!selector) return
    pendingFocus.current = null
    document.querySelector<HTMLElement>(selector)?.focus()
  })

  const actions = useMemo<RowActions>(() => {
    const change = (update: (outline: Outline) => Outline, options: { field?: string; focus?: string } = {}) => {
      const coalesce = options.field !== undefined && typing.current === options.field
      typing.current = options.field ?? null
      pendingFocus.current = options.focus ?? null
      setError(null)
      setHistory((current) => {
        const next = update(current.draft.outline)
        return next === current.draft.outline ? current : pushDraft(current, { ...current.draft, outline: next }, coalesce)
      })
    }
    return {
      renameChapter: (key, title) => change((outline) => renameChapter(outline, key, title), { field: `chapter ${key}` }),
      renameAct: (startKey, title) => change((outline) => renameAct(outline, startKey, title), { field: `act ${startKey}` }),
      removeAct: (startKey, focusKey) =>
        change((outline) => removeAct(outline, startKey), { focus: `[data-chapter-title="${CSS.escape(focusKey)}"]` }),
      startAct: (key) => change((outline) => startAct(outline, key), { focus: `[data-act-title="${CSS.escape(key)}"]` }),
      setLeftOut: (key, leftOut) => change((outline) => setLeftOut(outline, key, leftOut)),
      merge: (key, direction, targetKey) =>
        change((outline) => mergeChapter(outline, key, direction), {
          focus: `[data-chapter-menu="${CSS.escape(targetKey)}"]`,
        }),
      endTyping: () => {
        typing.current = null
      },
    }
  }, [])

  /** A change to how it's read or split: a new step for Undo, even mid-typing. */
  const resettle = (update: (draft: Draft) => Draft) => {
    typing.current = null
    setError(null)
    setHistory((current) => pushDraft(current, update(current.draft)))
  }

  const undo = () => {
    if (!canUndo) return
    typing.current = null
    setError(null)
    setHistory(undoDraft)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (importing.current) return
    importing.current = true
    setBookDialogBusy(true)
    setBusy(true)
    setError(null)
    try {
      const imported = await importBook(db, { ...details, outline })
      rememberBook(imported.bookId)
      setBookDialogBusy(false)
      if (useBookDialogs.getState().dialog === "import") closeBookDialog()
      navigate(`/b/${imported.bookId}/write/${imported.chapterId}`)
      toast(`Imported “${imported.title}”`)
    } catch (caught) {
      if (caught instanceof ImportError) {
        setError(caught.message)
      } else {
        console.error("[import]", caught)
        setError(IMPORT_FAILED)
      }
      setBusy(false)
    } finally {
      importing.current = false
      setBookDialogBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Import a manuscript</DialogTitle>
        <DialogDescription>
          {sourceLabel(source)}: check where its chapters start, then import it as a new book.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input
            id={`${id}-title`}
            value={details.title}
            onChange={(event) => setDetails((current) => ({ ...current, title: event.target.value }))}
            placeholder="Untitled book"
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-author`}>Author</Label>
          <Input
            id={`${id}-author`}
            value={details.author}
            onChange={(event) => setDetails((current) => ({ ...current, author: event.target.value }))}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-mode`}>Chapters start at</Label>
          <Select
            value={modeKey(settings.mode)}
            onValueChange={(value) => {
              const choice = analysis.choices.find((option) => modeKey(option.mode) === value)
              if (choice) resettle((draft) => resplit(draft, { ...draft.settings, mode: choice.mode }))
            }}
          >
            <SelectTrigger id={`${id}-mode`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {analysis.choices.map((choice) => (
                <SelectItem key={modeKey(choice.mode)} value={modeKey(choice.mode)}>
                  {choiceLabel(choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {source.paragraphing && (
          <div className="grid gap-2">
            <Label htmlFor={`${id}-paragraphs`}>Paragraphs</Label>
            <Select
              value={source.paragraphing}
              onValueChange={(value) => {
                const option = PARAGRAPHINGS.find((paragraphing) => paragraphing.value === value)
                if (option) resettle((draft) => reparagraph(draft, option.value))
              }}
            >
              <SelectTrigger id={`${id}-paragraphs`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {PARAGRAPHINGS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {offerScenes && (
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox
            id={`${id}-scenes`}
            checked={settings.scenes}
            onCheckedChange={(checked) => resettle((draft) => resplit(draft, { ...draft.settings, scenes: checked === true }))}
          />
          <Label htmlFor={`${id}-scenes`} className="font-normal">
            Split chapters into scenes at scene breaks and smaller headings
          </Label>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {statsLabel(stats)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // Not disabled when there's nothing to undo, which would drop focus after the last Undo.
          aria-disabled={!canUndo}
          onClick={undo}
          className="aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        >
          <Undo2Icon />
          Undo
        </Button>
      </div>

      {/* The list takes the room the dialog has; on a short screen it keeps a few rows, and the dialog scrolls. */}
      <ul aria-label="Chapters to import" className="min-h-48 flex-1 overflow-y-auto rounded-lg border">
        {rows.map((row, index) => {
          if (row.kind === "act") {
            const next = rows[index + 1]
            return (
              <ActRow
                key={`act ${row.startKey}`}
                startKey={row.startKey}
                title={row.title}
                number={row.number}
                focusKey={next?.kind === "chapter" ? next.chapter.key : row.startKey}
                actions={actions}
              />
            )
          }
          return (
            <ChapterRow
              key={row.chapter.key}
              chapter={row.chapter}
              number={row.number}
              above={outline[row.index - 1]?.key ?? null}
              below={outline[row.index + 1]?.key ?? null}
              actions={actions}
            />
          )
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeftIcon />
          Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={busy}>
            <FileUpIcon />
            {busy ? "Importing…" : "Import"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

interface ActRowProps {
  startKey: string
  title: string
  number: number
  focusKey: string
  actions: RowActions
}

const ActRow = memo(function ActRow({ startKey, title, number, focusKey, actions }: ActRowProps) {
  return (
    <li className="flex items-center gap-2 border-b bg-muted/50 py-1.5 pr-1.5 pl-3">
      <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">Act {number}</span>
      <Input
        value={title}
        onChange={(event) => actions.renameAct(startKey, event.target.value)}
        onBlur={actions.endTyping}
        onKeyDown={nextTitleOnEnter}
        placeholder="Untitled act"
        aria-label={`Title of act ${number}`}
        autoComplete="off"
        data-act-title={startKey}
        className="h-7 flex-1 font-medium"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove act ${number}, keeping its chapters`}
        title="Remove act, keeping its chapters"
        onClick={() => actions.removeAct(startKey, focusKey)}
        className="text-muted-foreground"
      >
        <FolderMinusIcon />
      </Button>
    </li>
  )
})

interface ChapterRowProps {
  chapter: DraftChapter
  /** null for a chapter left out. */
  number: number | null
  /** The chapters either side, to merge into. */
  above: string | null
  below: string | null
  actions: RowActions
}

const ChapterRow = memo(function ChapterRow({ chapter, number, above, below, actions }: ChapterRowProps) {
  const id = useId()
  // Merging and starting an act place focus themselves, so they wait for the menu to close and let it go.
  const menu = useAfterMenu()
  const name = number === null ? "left-out chapter" : `chapter ${number}`

  return (
    <li className={cn("flex items-start gap-2 border-b py-2 pr-1.5 pl-1 last:border-b-0", chapter.leftOut && "bg-muted/30")}>
      <span aria-hidden className="w-7 shrink-0 pt-1.5 text-right text-xs text-muted-foreground tabular-nums pointer-coarse:pt-3.5">
        {number ?? "–"}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <Input
          value={chapter.title}
          onChange={(event) => actions.renameChapter(chapter.key, event.target.value)}
          onBlur={actions.endTyping}
          onKeyDown={nextTitleOnEnter}
          placeholder={UNTITLED_CHAPTER}
          aria-label={`Title of ${name}`}
          aria-describedby={`${id}-meta`}
          autoComplete="off"
          data-chapter-title={chapter.key}
          className={cn(chapter.leftOut && "text-muted-foreground")}
        />
        <p id={`${id}-meta`} className="truncate text-xs text-muted-foreground">
          {chapterMeta(chapter)}
        </p>
      </div>
      <DeferredMenu
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${name}`}
            data-chapter-menu={chapter.key}
            className="mt-0.5 text-muted-foreground"
          >
            <EllipsisIcon />
          </Button>
        }
      >
        <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={menu.onCloseAutoFocus}>
          <DropdownMenuItem
            disabled={above === null}
            onSelect={() => {
              if (above !== null) menu.after(() => actions.merge(chapter.key, "up", above))
            }}
          >
            <ArrowUpToLineIcon />
            Merge into the chapter above
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={below === null}
            onSelect={() => {
              if (below !== null) menu.after(() => actions.merge(chapter.key, "down", below))
            }}
          >
            <ArrowDownToLineIcon />
            Merge into the chapter below
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={chapter.act !== null}
            onSelect={() => menu.after(() => actions.startAct(chapter.key))}
          >
            <FolderPlusIcon />
            Start an act here
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.setLeftOut(chapter.key, !chapter.leftOut)}>
            {chapter.leftOut ? <EyeIcon /> : <EyeOffIcon />}
            {chapter.leftOut ? "Put back" : "Leave out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DeferredMenu>
    </li>
  )
})
