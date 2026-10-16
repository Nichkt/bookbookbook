import { EllipsisIcon, PenLineIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { announce, attempt } from "@/app/feedback"
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
import { byData, focusSoon } from "@/lib/focus"
import { formatCount, parseCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { BeatsEditor } from "./BeatsEditor"
import { trashChapterWithUndo, trashSceneWithUndo } from "./commands"
import { templateBeatName } from "./display"
import { EntryPicker } from "./EntryPicker"
import { LabelsInput } from "./LabelsInput"
import { createScene, setChapterLinks, updateChapter, updateScene } from "./mutations"
import { usePlanContext, type FocusItem } from "./planContext"
import type { PlanChapter } from "./planData"
import { isStatus, STATUS_OPTIONS, UNTITLED_CHAPTER } from "./status"
import { StoryTimeEditor } from "./StoryTimeEditor"

/** A chapter that just vanished (trashed elsewhere) gets a moment to come back before saying so. */
const MISSING_DELAY_MS = 600

/** The chapter drawer (DESIGN.md §6): everything the plan holds about one chapter. Changes save as you type. */
export function ChapterDrawer({ chapterId, onClose }: { chapterId: string; onClose: () => void }) {
  const { plan } = usePlanContext()
  const chapter = plan.chapterById.get(chapterId)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (chapter) return
    const timer = setTimeout(() => setMissing(true), MISSING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [chapter])

  if (chapter) return <ChapterForm key={chapter.id} chapter={chapter} onClose={onClose} />
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

function ChapterForm({ chapter, onClose }: { chapter: PlanChapter; onClose: () => void }) {
  const { db, bookId, plan, focusItem } = usePlanContext()
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
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-surface/95 px-4 backdrop-blur">
        <h2
          tabIndex={-1}
          data-drawer-heading={chapter.id}
          className="mr-auto rounded-sm text-xs font-semibold tracking-widest text-muted-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Chapter {chapter.number}
        </h2>
        <Link
          to={`/b/${bookId}/write/${chapter.id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-ink-2")}
        >
          <PenLineIcon />
          Write
        </Link>
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
        <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose} className="text-muted-foreground">
          <XIcon />
        </Button>
      </header>

      <div className="grid gap-5 px-4 pt-3 pb-8">
        <DraftInput
          data-drawer-title={chapter.id}
          aria-label="Chapter title"
          placeholder={UNTITLED_CHAPTER}
          value={chapter.title ?? ""}
          onSave={(title) => save({ title })}
          className="-mx-2 h-auto w-[calc(100%+1rem)] border-transparent bg-transparent px-2 py-1 font-heading text-2xl leading-tight font-semibold shadow-none hover:border-input md:text-2xl dark:bg-transparent"
        />

        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
          <Label htmlFor={fieldId("status")} className="text-ink-2">
            Status
          </Label>
          <Select value={isStatus(chapter.status) ? chapter.status : "idea"} onValueChange={(status) => void attempt("save status", save({ status }))}>
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

          <Label id={fieldId("pov-label")} className="text-ink-2">
            POV
          </Label>
          <EntryPicker
            labelId={fieldId("pov-label")}
            typeKey="characters"
            noun="character"
            emptyText="No POV"
            value={chapter.pov_entry_id ? [chapter.pov_entry_id] : []}
            onChange={(ids) => save({ pov_entry_id: ids[0] ?? null })}
          />

          <Label htmlFor={fieldId("target")} className="text-ink-2">
            Target
          </Label>
          <TargetField chapter={chapter} inputId={fieldId("target")} />

          <Label id={fieldId("location-label")} className="text-ink-2">
            Location
          </Label>
          <EntryPicker
            labelId={fieldId("location-label")}
            typeKey="locations"
            noun="place"
            emptyText="No location"
            value={chapter.location_entry_id ? [chapter.location_entry_id] : []}
            onChange={(ids) => save({ location_entry_id: ids[0] ?? null })}
          />

          <Label id={fieldId("time-label")} className="text-ink-2">
            Story time
          </Label>
          <StoryTimeEditor
            labelId={fieldId("time-label")}
            value={chapter.time}
            onSave={(storyTime) => save({ story_time: storyTime })}
          />

          <Label id={fieldId("threads-label")} className="self-start pt-2 text-ink-2">
            Threads
          </Label>
          <EntryPicker
            labelId={fieldId("threads-label")}
            typeKey="plot_threads"
            noun="thread"
            emptyText="No threads"
            multiple
            value={chapter.threads}
            onChange={(ids) => setChapterLinks(db, chapter.id, "thread", ids)}
          />

          <Label id={fieldId("present-label")} className="self-start pt-2 text-ink-2">
            Present
          </Label>
          <EntryPicker
            labelId={fieldId("present-label")}
            typeKey="characters"
            noun="character"
            emptyText="Nobody yet"
            multiple
            value={chapter.present}
            onChange={(ids) => setChapterLinks(db, chapter.id, "present", ids)}
          />

          <Label htmlFor={fieldId("labels")} className="self-start pt-2 text-ink-2">
            Labels
          </Label>
          <LabelsInput
            id={fieldId("labels")}
            labels={chapter.labelList}
            suggestions={plan.labels}
            onChange={(labels) => save({ labels: JSON.stringify(labels) })}
          />

          {chapter.template_beat_key && (
            <>
              <span className="text-ink-2">Template beat</span>
              <span className="truncate px-1">{templateBeatName(chapter.template_beat_key)}</span>
            </>
          )}
        </div>

        <Section title="Summary" htmlFor={fieldId("summary")}>
          <DraftTextarea
            id={fieldId("summary")}
            placeholder="What happens in this chapter?"
            value={chapter.summary ?? ""}
            onSave={(summary) => save({ summary })}
            className="min-h-20"
          />
        </Section>

        <Section title="Beats" labelId={fieldId("beats-label")}>
          <BeatsEditor chapter={chapter} labelId={fieldId("beats-label")} />
        </Section>

        <Section title="Scenes" labelId={fieldId("scenes-label")}>
          <ScenesList chapter={chapter} labelId={fieldId("scenes-label")} />
        </Section>

        <Section title="Notes" htmlFor={fieldId("notes")}>
          <DraftTextarea
            id={fieldId("notes")}
            placeholder="Research, reminders, anything."
            value={chapter.notes ?? ""}
            onSave={(notes) => save({ notes })}
            className="min-h-20"
          />
        </Section>
      </div>
    </div>
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
    <section className="grid gap-1.5">
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

/** The chapter's word target. Takes "3000" or "3,000"; anything else goes back to the saved value. */
function TargetField({ chapter, inputId }: { chapter: PlanChapter; inputId: string }) {
  const { db } = usePlanContext()
  const stored = chapter.word_target ? String(chapter.word_target) : ""
  const draft = useDraft(stored, (text) => {
    const target = parseCount(text)
    if (text.trim() && target === null) return
    return updateChapter(db, chapter.id, { word_target: target })
  })
  const invalid = draft.value.trim() !== "" && parseCount(draft.value) === null
  return (
    <div className="flex items-center gap-2">
      <Input
        id={inputId}
        inputMode="numeric"
        placeholder="None"
        aria-invalid={invalid || undefined}
        aria-describedby={`${inputId}-help`}
        value={draft.value}
        onChange={(event) => draft.onChange(event.target.value)}
        onFocus={draft.onFocus}
        onBlur={() => {
          draft.onBlur()
          if (invalid) {
            draft.reset()
            announce("The target needs to be a number of words, like 3000.")
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
  const { db, plan } = usePlanContext()
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
