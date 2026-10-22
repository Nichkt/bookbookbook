import { ChevronLeftIcon, ChevronRightIcon, LayoutGridIcon, PlusIcon } from "lucide-react"
import { useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { attempt } from "@/app/feedback"
import { DraftTextarea } from "@/components/DraftField"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useDraft } from "@/components/useDraft"
import { WordProgress } from "@/components/WordProgress"
import { whenEditor } from "@/editor/activeEditor"
import { createScene, updateChapter } from "@/features/plan/mutations"
import type { PlanChapter, PlanSceneRow } from "@/features/plan/planData"
import { chapterTitle, statusOf, UNTITLED_CHAPTER } from "@/features/plan/status"
import { byData, focusPending, focusSoon, nothingFocused } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { revealScene, useEnsureScene } from "./pageHooks"
import { SceneBlock } from "./SceneBlock"
import { sceneNeighbors, sceneToShow, stopPath, type SceneStop } from "./sequence"
import { navState, useWrite, useWriteBasics, useWritePlace, writePath, type WriteNavState } from "./writeContext"

/** The chapter's title and summary: page text until hovered or edited, wrapping as they grow. */
const FIELD =
  "-mx-2 block min-h-0 w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 hover:border-input dark:bg-transparent pointer-coarse:min-h-11"

/** The chapter's title, which wraps as a heading does. Enter goes on to the summary. */
function ChapterTitle({ chapter }: { chapter: PlanChapter }) {
  const { db } = useWriteBasics()
  const draft = useDraft(chapter.title ?? "", (title) => updateChapter(db, chapter.id, { title }))
  return (
    <Textarea
      data-write-chapter-title={chapter.id}
      aria-label={`Title of chapter ${chapter.number}`}
      placeholder={UNTITLED_CHAPTER}
      rows={1}
      value={draft.value}
      // A title is one line: a line break pasted in becomes a space.
      onChange={(event) => draft.onChange(event.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
      onFocus={draft.onFocus}
      onBlur={draft.onBlur}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || isComposing(event.nativeEvent)) return
        event.preventDefault()
        document.querySelector<HTMLElement>(byData("write-chapter-summary", chapter.id))?.focus()
      }}
      className={cn(
        FIELD,
        "mt-1.5 py-0.5 font-heading text-3xl leading-tight font-semibold text-ink md:text-3xl",
        "placeholder:font-normal placeholder:italic",
      )}
    />
  )
}

/** A chapter's heading block: number, status, title and summary to edit in place, and words, with a way to its plan. */
export function ChapterHeader({
  chapter,
  level,
  scene,
}: {
  chapter: PlanChapter
  level: 1 | 2
  /** In the Scene view: which of the chapter's scenes is showing. */
  scene?: { index: number; count: number }
}) {
  const { bookId, db } = useWriteBasics()
  const status = statusOf(chapter.status)
  const Heading = level === 1 ? "h1" : "h2"

  return (
    <header data-tour="write-heading" data-focus-dim="" className="mb-10 font-sans">
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <span>Chapter {chapter.number}</span>
          {scene && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Scene {scene.index + 1} of {scene.count}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2 rounded-full", status.dot)} />
            {status.label}
          </span>
        </p>
        <Link
          to={`/b/${bookId}/plan?chapter=${chapter.id}`}
          aria-label={`Plan chapter ${chapter.number}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-my-1 ml-auto shrink-0 text-ink-2 pointer-coarse:px-3",
          )}
        >
          <LayoutGridIcon />
          Plan
        </Link>
      </div>
      {/* For moving through the page by heading, and for arriving at the chapter; the fields below are what show. */}
      <Heading tabIndex={-1} data-write-heading={chapter.id} className="sr-only">
        {chapterTitle(chapter.title)}
      </Heading>
      <ChapterTitle chapter={chapter} />
      <DraftTextarea
        data-write-chapter-summary={chapter.id}
        aria-label={`Summary of chapter ${chapter.number}`}
        placeholder="What happens in this chapter?"
        rows={1}
        value={chapter.summary ?? ""}
        onSave={(summary) => updateChapter(db, chapter.id, { summary })}
        className={cn(FIELD, "mt-2 py-1 leading-relaxed text-muted-foreground placeholder:italic pointer-coarse:py-2.5")}
      />
      <WordProgress
        words={chapter.words}
        target={chapter.word_target}
        label={`Chapter ${chapter.number} word count target`}
        className="mt-3"
      />
    </header>
  )
}

/** The Chapter view: the chapter's scenes one after another (DESIGN.md §8). */
export function ChapterUnit({ chapter }: { chapter: PlanChapter }) {
  const { bookId, plan } = useWrite()
  const { sceneId } = useWritePlace()
  const location = useLocation()
  useEnsureScene(chapter)

  // On arrival: to the scene the URL names, else the top.
  useEffect(() => {
    const { focus } = navState(location.state)
    if (sceneId) return revealScene(sceneId, focus === "scene" || (!focusPending() && nothingFocused()))
    window.scrollTo(0, 0)
    if (focus === "heading") focusSoon(byData("write-heading", chapter.id))
    return undefined
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps -- on arrival only

  const previous = plan.chapters[chapter.number - 2]
  const next = plan.chapters[chapter.number]
  const page = (target: PlanChapter): PagerTarget => ({
    to: writePath(bookId, target.id),
    label: `Chapter ${target.number}: ${chapterTitle(target.title)}`,
  })

  return (
    <article data-write-chapter={chapter.id} className="prose-page mx-auto px-5 pt-10 pb-24 md:px-8">
      <ChapterHeader chapter={chapter} level={1} />
      {chapter.scenes.map((scene, index) => (
        <SceneBlock
          key={scene.id}
          chapter={chapter}
          scene={scene}
          index={index}
          divider={index > 0}
          headingLevel={2}
        />
      ))}
      {chapter.scenes.length > 0 && <AddScene chapter={chapter} />}
      <Pager
        label="Chapter pages"
        previous={previous && page(previous)}
        next={next && page(next)}
      />
    </article>
  )
}

function AddScene({ chapter }: { chapter: PlanChapter }) {
  const { db } = useWrite()
  const add = async () => {
    const id = await attempt("add scene", createScene(db, chapter.id))
    if (id) focusSoon(byData("write-scene-title", id))
  }
  return (
    <div data-focus-dim="" className="mt-10 flex justify-center font-sans">
      <Button variant="ghost" size="sm" onClick={() => void add()} className="text-muted-foreground">
        <PlusIcon />
        Add scene
      </Button>
    </div>
  )
}

/** The Scene view: one scene at a time, paging through the book's scenes in reading order. */
export function SceneUnit({ chapter }: { chapter: PlanChapter }) {
  const { bookId, plan } = useWrite()
  const { sceneId } = useWritePlace()
  const location = useLocation()
  const scene = sceneToShow(chapter, sceneId)
  const index = scene ? chapter.scenes.indexOf(scene) : -1
  useEnsureScene(chapter)

  useEffect(() => {
    window.scrollTo(0, 0)
    const { focus } = navState(location.state)
    if (focus === "heading") focusSoon(byData("write-heading", chapter.id))
    else if (scene && (focus === "scene" || (sceneId && !focusPending() && nothingFocused()))) {
      return whenEditor(scene.id, ({ editor }) => editor.commands.focus("start"))
    }
    return undefined
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps -- on arrival only

  const { previous, next } = sceneNeighbors(plan, chapter.id, scene?.id ?? null)
  const page = (stop: SceneStop): PagerTarget => {
    const sceneName = stop.scene && !stop.scene.is_implicit ? scenePageName(stop.chapter, stop.scene) : null
    if (sceneName && stop.chapter.id === chapter.id) return { to: stopPath(bookId, stop), label: sceneName }
    const chapterName = `Chapter ${stop.chapter.number}: ${chapterTitle(stop.chapter.title)}`
    return { to: stopPath(bookId, stop), label: sceneName ? `${chapterName} · ${sceneName}` : chapterName }
  }

  return (
    <article data-write-chapter={chapter.id} className="prose-page mx-auto px-5 pt-10 pb-24 md:px-8">
      <ChapterHeader
        chapter={chapter}
        level={1}
        scene={scene && !scene.is_implicit ? { index, count: chapter.scenes.length } : undefined}
      />
      {scene && (
        <>
          <SceneBlock key={scene.id} chapter={chapter} scene={scene} index={index} divider={false} headingLevel={2} />
          <NewSceneAfter chapter={chapter} index={index} />
        </>
      )}
      <Pager label="Scene pages" previous={previous ? page(previous) : undefined} next={next ? page(next) : undefined} />
    </article>
  )
}

const scenePageName = (chapter: PlanChapter, scene: Readonly<PlanSceneRow>) => {
  const title = scene.title?.trim()
  return `Scene ${chapter.scenes.indexOf(scene) + 1}${title ? `: ${title}` : ""}`
}

function NewSceneAfter({ chapter, index }: { chapter: PlanChapter; index: number }) {
  const { db, bookId } = useWrite()
  const navigate = useNavigate()
  const add = async () => {
    const id = await attempt("add scene", createScene(db, chapter.id, { index: index + 1 }))
    if (!id) return
    navigate(writePath(bookId, chapter.id, id))
    focusSoon(byData("write-scene-title", id))
  }
  return (
    <div data-focus-dim="" className="mt-10 flex justify-center font-sans">
      <Button variant="ghost" size="sm" onClick={() => void add()} className="text-muted-foreground">
        <PlusIcon />
        New scene after this
      </Button>
    </div>
  )
}

interface PagerTarget {
  to: string
  label: string
}

function Pager({ label, previous, next }: { label: string; previous?: PagerTarget; next?: PagerTarget }) {
  if (!previous && !next) return null
  return (
    <nav aria-label={label} data-focus-dim="" className="mt-16 grid gap-3 font-sans sm:grid-cols-2">
      {previous && <PagerLink target={previous} direction="previous" />}
      {next && <PagerLink target={next} direction="next" />}
    </nav>
  )
}

function PagerLink({ target, direction }: { target: PagerTarget; direction: "previous" | "next" }) {
  const state: WriteNavState = { focus: "heading" }
  return (
    <Link
      to={target.to}
      state={state}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-lg border bg-surface px-4 py-3 transition-colors hover:bg-accent",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        direction === "next" && "items-end text-right sm:col-start-2",
      )}
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {direction === "previous" && <ChevronLeftIcon aria-hidden="true" className="size-3.5" />}
        {direction === "previous" ? "Previous" : "Next"}
        {direction === "next" && <ChevronRightIcon aria-hidden="true" className="size-3.5" />}
      </span>{" "}
      <span className="max-w-full text-sm font-medium break-words text-ink">{target.label}</span>
    </Link>
  )
}
