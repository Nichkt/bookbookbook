import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  LayoutGridIcon,
  PenLineIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { announce, attempt } from "@/app/feedback"
import { ChipsInput } from "@/components/ChipsInput"
import { DraftInput, DraftTextarea } from "@/components/DraftField"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDraft } from "@/components/useDraft"
import { WordProgress } from "@/components/WordProgress"
import { TermHint } from "@/features/help/TermHint"
import { writePath, type WriteNavState } from "@/features/write/writeContext"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount, parseCount, tidyCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { BeatsEditor } from "./BeatsEditor"
import { trashChapterWithUndo, trashSceneWithUndo } from "./commands"
import { templateBeatName } from "./display"
import { EntryPicker } from "./EntryPicker"
import { createScene, setChapterLinks, updateChapter, updateScene } from "./mutations"
import { useChapterDetails, type FocusItem } from "./planContext"
import type { PlanChapter } from "./planData"
import { chapterTitle, isStatus, STATUS_OPTIONS, UNTITLED_CHAPTER } from "./status"
import { StoryTimeEditor } from "./StoryTimeEditor"

/** A chapter that just vanished (trashed elsewhere) gets a moment to come back before saying so. */
const MISSING_DELAY_MS = 600

/** “Write this chapter” lands on the chapter's heading in Write. */
const WRITE_STATE: WriteNavState = { focus: "heading" }

export type ChapterStepDirection = "previous" | "next"

/** Moves the details to another chapter: the pop-out's previous and next buttons. */
export type ChapterStep = (chapterId: string, direction: ChapterStepDirection) => void

interface ChapterDrawerProps {
  chapterId: string
  onClose: () => void
  /** Given in the Plan's pop-out, which steps through the chapters. */
  onStep?: ChapterStep
}

/**
 * A chapter's details (DESIGN.md §6): everything the plan holds about it, popped out over the Plan or beside the text
 * in Write. Two columns when there's room. Changes save as you type.
 */
export function ChapterDrawer({ chapterId, onClose, onStep }: ChapterDrawerProps) {
  const { plan } = useChapterDetails()
  const chapter = plan.chapterById.get(chapterId)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (chapter) return
    const timer = setTimeout(() => setMissing(true), MISSING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [chapter])

  if (chapter) return <ChapterForm key={chapter.id} chapter={chapter} onClose={onClose} onStep={onStep} />
  if (!missing) return null
  return (
    <div className="grid gap-3 p-5">
      <h2 tabIndex={-1} className="font-heading text-lg font-semibold outline-none">
        This chapter isn't here
      </h2>
      <p className="text-sm text-ink-2">It may have been moved to the Trash. Restore it from the Trash in the book menu.</p>
      <Button variant="outline" size="sm" className="justify-self-start" onClick={onClose}>
        Close
      </Button>
    </div>
  )
}

function ChapterForm({ chapter, onClose, onStep }: { chapter: PlanChapter; onClose: () => void; onStep?: ChapterStep }) {
  const { db, bookId, plan, focusItem, place } = useChapterDetails()
  const id = useId()
  const fieldId = (name: string) => `${id}-${name}`
  const menuRan = useRef(false)

  const save = (patch: Parameters<typeof updateChapter>[2]) => updateChapter(db, chapter.id, patch)

  const trash = () => {
    menuRan.current = true
    // Close first: a closing sheet stops holding focus, so focus can move to the next card.
    onClose()
    void trashChapterWithUndo(db, plan, chapter.id, focusItem)
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-surface/95 px-4 backdrop-blur sm:px-5 pointer-coarse:h-14">
        <h2
          tabIndex={-1}
          data-drawer-heading={chapter.id}
          className="rounded-sm text-xs font-semibold tracking-widest text-muted-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Chapter {chapter.number}
        </h2>
        {onStep && <ChapterSteps chapter={chapter} onStep={onStep} />}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {place === "write" && (
            <Link
              to={`/b/${bookId}/plan?chapter=${chapter.id}`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-ink-2")}
            >
              <LayoutGridIcon />
              Open in Plan
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More for this chapter" className="text-muted-foreground">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(event) => {
                if (!menuRan.current) return
                menuRan.current = false
                event.preventDefault()
              }}
            >
              <DropdownMenuItem variant="destructive" onSelect={trash}>
                <Trash2Icon />
                Move to Trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close details"
            data-popout-close=""
            onClick={onClose}
            className="text-muted-foreground"
          >
            <XIcon />
          </Button>
        </div>
      </header>

      <div className="@container px-4 pt-3 pb-8 sm:px-5">
        <DraftInput
          data-drawer-title={chapter.id}
          aria-label="Chapter title"
          placeholder={UNTITLED_CHAPTER}
          value={chapter.title ?? ""}
          onSave={(title) => save({ title })}
          className="-mx-2 h-auto w-[calc(100%+1rem)] border-transparent bg-transparent px-2 py-1 font-heading text-2xl leading-tight font-semibold shadow-none hover:border-input md:text-2xl dark:bg-transparent"
        />
        {place === "plan" && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              to={writePath(bookId, chapter.id)}
              state={WRITE_STATE}
              data-tour="popout-write"
              className={cn(buttonVariants({ size: "sm" }), "pointer-coarse:h-11")}
            >
              <PenLineIcon />
              Write this chapter
            </Link>
            <WordProgress
              words={chapter.words}
              target={chapter.word_target}
              label={`Chapter ${chapter.number} word count target`}
            />
          </div>
        )}

        <div className="mt-5 grid gap-x-8 gap-y-7 @2xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="grid content-start gap-6">
            <Section title="Summary" htmlFor={fieldId("summary")} term="summary">
              <DraftTextarea
                id={fieldId("summary")}
                placeholder="What happens in this chapter?"
                value={chapter.summary ?? ""}
                onSave={(summary) => save({ summary })}
                className="min-h-20"
              />
            </Section>

            <Section title="Moments" labelId={fieldId("beats-label")} term="moment" tour="popout-moments">
              <BeatsEditor chapter={chapter} labelId={fieldId("beats-label")} />
            </Section>

            <Section title="Scenes" labelId={fieldId("scenes-label")} term="scene">
              <ScenesList chapter={chapter} labelId={fieldId("scenes-label")} />
            </Section>

            <Section title="Notes" htmlFor={fieldId("notes")} term="notes">
              <DraftTextarea
                id={fieldId("notes")}
                placeholder="Research, reminders, anything."
                value={chapter.notes ?? ""}
                onSave={(notes) => save({ notes })}
                className="min-h-20"
              />
            </Section>
          </div>

          <section
            aria-labelledby={fieldId("details")}
            data-tour="popout-details"
            className="grid content-start gap-4 text-sm @2xl:border-l @2xl:pl-8"
          >
            <h3 id={fieldId("details")} className={SECTION_TITLE}>
              Details
            </h3>
            <Field label="Status" htmlFor={fieldId("status")} term="status">
              <Select
                value={isStatus(chapter.status) ? chapter.status : "idea"}
                onValueChange={(status) => void attempt("save status", save({ status }))}
              >
                <SelectTrigger id={fieldId("status")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", option.dot)} />
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Point of view" labelId={fieldId("pov-label")} term="point-of-view">
              <EntryPicker
                labelId={fieldId("pov-label")}
                typeKey="characters"
                noun="character"
                emptyText="Nobody chosen"
                value={chapter.pov_entry_id ? [chapter.pov_entry_id] : []}
                onChange={(ids) => save({ pov_entry_id: ids[0] ?? null })}
              />
            </Field>

            <Field label="Word count target" htmlFor={fieldId("target")} term="word-count-target">
              <TargetField chapter={chapter} inputId={fieldId("target")} />
            </Field>

            <Field label="Location" labelId={fieldId("location-label")} term="location">
              <EntryPicker
                labelId={fieldId("location-label")}
                typeKey="locations"
                noun="place"
                emptyText="No location"
                value={chapter.location_entry_id ? [chapter.location_entry_id] : []}
                onChange={(ids) => save({ location_entry_id: ids[0] ?? null })}
              />
            </Field>

            <Field label="Story time" labelId={fieldId("time-label")} term="story-time">
              <StoryTimeEditor
                labelId={fieldId("time-label")}
                value={chapter.time}
                onSave={(storyTime) => save({ story_time: storyTime })}
              />
            </Field>

            <Field label="Story points" labelId={fieldId("threads-label")} term="story-point">
              <EntryPicker
                labelId={fieldId("threads-label")}
                typeKey="plot_threads"
                noun="story point"
                emptyText="No story points"
                multiple
                value={chapter.threads}
                onChange={(ids) => setChapterLinks(db, chapter.id, "thread", ids)}
              />
            </Field>

            <Field label="What characters are present" labelId={fieldId("present-label")} term="characters-present">
              <EntryPicker
                labelId={fieldId("present-label")}
                typeKey="characters"
                noun="character"
                emptyText="Nobody yet"
                multiple
                value={chapter.present}
                onChange={(ids) => setChapterLinks(db, chapter.id, "present", ids)}
              />
            </Field>

            <Field label="Labels" htmlFor={fieldId("labels")} term="labels">
              <ChipsInput
                id={fieldId("labels")}
                noun="label"
                placeholder="Add a label…"
                values={chapter.labelList}
                suggestions={plan.labels}
                onChange={(labels) => save({ labels: JSON.stringify(labels) })}
              />
            </Field>

            {chapter.template_beat_key && (
              <Field label="Structure moment" labelId={fieldId("structure-label")} term="structure-moment">
                <p className="px-1 text-ink">
                  {templateBeatName(chapter.template_beat_key)}
                </p>
              </Field>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** The pop-out's previous and next chapter buttons. They stay focusable at the ends, so focus doesn't drop. */
function ChapterSteps({ chapter, onStep }: { chapter: PlanChapter; onStep: ChapterStep }) {
  const { plan } = useChapterDetails()
  const index = plan.chapters.findIndex((other) => other.id === chapter.id)
  return (
    <div className="ml-1 flex items-center">
      <StepButton direction="previous" target={plan.chapters[index - 1]} onStep={onStep} />
      <StepButton direction="next" target={plan.chapters[index + 1]} onStep={onStep} />
    </div>
  )
}

function StepButton({
  direction,
  target,
  onStep,
}: {
  direction: ChapterStepDirection
  target: PlanChapter | undefined
  onStep: ChapterStep
}) {
  const label = direction === "previous" ? "Previous chapter" : "Next chapter"
  const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      data-chapter-nav={direction}
      aria-label={label}
      aria-disabled={!target || undefined}
      title={target ? `${label}: ${target.number}. ${chapterTitle(target.title)}` : undefined}
      onClick={() => target && onStep(target.id, direction)}
      className="text-muted-foreground aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
    >
      <Icon />
    </Button>
  )
}

const SECTION_TITLE = "text-xs font-semibold tracking-wide text-muted-foreground uppercase"

function Section({
  title,
  htmlFor,
  labelId,
  term,
  tour,
  children,
}: {
  title: string
  htmlFor?: string
  labelId?: string
  /** The glossary term the "?" beside the title opens. */
  term?: string
  /** Where the page tour points. */
  tour?: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-1.5" data-tour={tour}>
      <div className="flex items-center gap-1">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className={SECTION_TITLE}>
            {title}
          </Label>
        ) : (
          <h3 id={labelId} className={SECTION_TITLE}>
            {title}
          </h3>
        )}
        {term && <TermHint term={term} />}
      </div>
      {children}
    </section>
  )
}

/** A detail with its label above it, and a "?" that explains it. */
function Field({
  label,
  htmlFor,
  labelId,
  term,
  children,
}: {
  label: string
  htmlFor?: string
  labelId?: string
  term: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-5 items-center gap-1">
        <Label htmlFor={htmlFor} id={labelId} className="text-ink-2">
          {label}
        </Label>
        <TermHint term={term} />
      </div>
      {children}
    </div>
  )
}

/** The chapter's word count target, with separators. Takes "3000" or "3,000"; anything else goes back to the saved value. */
function TargetField({ chapter, inputId }: { chapter: PlanChapter; inputId: string }) {
  const { db } = useChapterDetails()
  const stored = chapter.word_target ? formatCount(chapter.word_target) : ""
  const draft = useDraft(stored, (text) => {
    const target = parseCount(text)
    if (text.trim() && target === null) return
    return updateChapter(db, chapter.id, { word_target: target })
  })
  const [editing, setEditing] = useState(false)
  const invalid = draft.value.trim() !== "" && parseCount(draft.value) === null
  return (
    <div className="flex items-center gap-2">
      <Input
        id={inputId}
        inputMode="numeric"
        placeholder="None"
        aria-invalid={invalid || undefined}
        aria-describedby={`${inputId}-help`}
        // Separators come back once you leave the field, however the number was typed.
        value={editing ? draft.value : tidyCount(draft.value)}
        onChange={(event) => draft.onChange(event.target.value)}
        onFocus={() => {
          setEditing(true)
          draft.onFocus()
        }}
        onBlur={() => {
          setEditing(false)
          draft.onBlur()
          if (invalid) {
            draft.reset()
            announce("The word count target needs to be a number of words, like 3000.")
          }
        }}
        className="w-24 tabular-nums"
      />
      <span id={`${inputId}-help`} className="text-xs text-muted-foreground tabular-nums">
        words · {formatCount(chapter.words)} written
      </span>
    </div>
  )
}

/** The scenes the writer made. A chapter written as one piece has none to list. */
function ScenesList({ chapter, labelId }: { chapter: PlanChapter; labelId: string }) {
  const { db, plan } = useChapterDetails()
  const scenes = chapter.explicitScenes
  const focusScene = (id: string) => focusSoon(byData("scene-title", id))
  const focusHere: FocusItem = (kind, id) =>
    kind === "scene" ? focusScene(id) : focusSoon(byData("scenes-add", chapter.id))

  const add = async () => {
    const id = await attempt("add scene", createScene(db, chapter.id))
    if (id) focusScene(id)
  }

  return (
    <div className="grid gap-1">
      {scenes.length > 0 ? (
        <ol aria-labelledby={labelId} className="grid gap-0.5">
          {scenes.map((scene, index) => (
            <li key={scene.id} className="group/scene flex items-center gap-1.5">
              <span aria-hidden="true" className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <DraftInput
                data-scene-title={scene.id}
                aria-label={`Scene ${index + 1} title`}
                placeholder="Untitled scene"
                value={scene.title ?? ""}
                onSave={(title) => updateScene(db, scene.id, { title })}
                className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-input dark:bg-transparent"
              />
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatCount(scene.word_count ?? 0)} words
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move scene ${index + 1} to the Trash`}
                onClick={() => void trashSceneWithUndo(db, plan, chapter.id, scene.id, focusHere)}
                className="text-muted-foreground opacity-0 group-focus-within/scene:opacity-100 group-hover/scene:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Written as one piece. Add scenes to break it up.</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        data-scenes-add={chapter.id}
        onClick={() => void add()}
        className="justify-self-start text-muted-foreground"
      >
        <PlusIcon />
        Add scene
      </Button>
    </div>
  )
}
