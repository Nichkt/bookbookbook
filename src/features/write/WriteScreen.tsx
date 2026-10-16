import { usePowerSync, useQuery } from "@powersync/react"
import { LayoutGridIcon, PenLineIcon } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router"
import { rememberBook } from "@/app/books"
import { attempt } from "@/app/feedback"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  ACTS_SQL,
  CHAPTERS_SQL,
  ensureScene,
  SCENES_SQL,
  type ActListRow,
  type ChapterListRow,
  type SceneListRow,
} from "@/db/queries"
import type { MentionMatcher } from "@/editor/mentions"
import { SceneEditor } from "@/editor/SceneEditor"
import { useMentionMatcher } from "@/editor/useMentionMatcher"
import { useSceneDoc, useSceneWords } from "@/editor/useSceneDoc"
import { createChapter } from "@/features/plan/mutations"
import { chapterTitle, statusOf } from "@/features/plan/status"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { navGroups, type NavGroup } from "./navigator"

const lastChapterKey = (bookId: string) => `bbb.lastChapter.${bookId}`

function readLastChapter(bookId: string) {
  try {
    return localStorage.getItem(lastChapterKey(bookId))
  } catch {
    return null
  }
}

/** Write screen: the chapter navigator plus the chapter's scenes as stacked editors (DESIGN.md §8). */
export function WriteScreen() {
  const { bookId = "", chapterId } = useParams()
  const acts = useQuery<ActListRow>(ACTS_SQL, [bookId])
  const chapters = useQuery<ChapterListRow>(CHAPTERS_SQL, [bookId])
  const groups = useMemo(() => navGroups(acts.data, chapters.data), [acts.data, chapters.data])
  const ordered = useMemo(() => groups.flatMap((group) => group.chapters), [groups])

  useEffect(() => {
    rememberBook(bookId)
    if (!chapterId) return
    try {
      localStorage.setItem(lastChapterKey(bookId), chapterId)
    } catch {
      // Only a convenience.
    }
  }, [bookId, chapterId])

  if (acts.isLoading || chapters.isLoading) return null
  if (ordered.length === 0) return <EmptyBook bookId={bookId} firstActId={acts.data[0]?.id ?? null} />
  if (!chapterId) {
    const last = readLastChapter(bookId)
    const target = ordered.find(({ chapter }) => chapter.id === last) ?? ordered[0]
    return <Navigate to={`/b/${bookId}/write/${target.chapter.id}`} replace />
  }

  const current = ordered.find(({ chapter }) => chapter.id === chapterId)
  return (
    <div className="flex flex-1">
      <ChapterList bookId={bookId} groups={groups} activeId={chapterId} />
      {current ? (
        <ChapterView
          key={chapterId}
          bookId={bookId}
          chapter={current.chapter}
          number={current.number}
          groups={groups}
        />
      ) : (
        <div className="p-8 text-muted-foreground">
          <p>That chapter isn't in this book. It may be in the Trash.</p>
          <Link
            to={`/b/${bookId}/write/${ordered[0].chapter.id}`}
            className="mt-2 inline-block text-ink underline underline-offset-2"
          >
            Go to chapter 1
          </Link>
        </div>
      )}
    </div>
  )
}

/** A book whose chapters are all gone: new books start with one, so they were moved to the Trash. */
function EmptyBook({ bookId, firstActId }: { bookId: string; firstActId: string | null }) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const start = async () => {
    if (busy) return
    setBusy(true)
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: firstActId }))
    setBusy(false)
    if (!id) return
    navigate(`/b/${bookId}/write/${id}`)
    focusSoon(`${byData("write-chapter", id)} [contenteditable="true"]`)
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="font-heading text-2xl font-semibold text-ink">No chapters yet</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Start writing, or lay the book out in the planner first. Chapters moved to the Trash can be restored from the
        book menu.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => void start()} disabled={busy}>
          <PenLineIcon />
          Write chapter 1
        </Button>
        <Link to={`/b/${bookId}/plan`} className={buttonVariants({ variant: "outline" })}>
          <LayoutGridIcon />
          Open the planner
        </Link>
      </div>
    </div>
  )
}

function ChapterList({ bookId, groups, activeId }: { bookId: string; groups: NavGroup[]; activeId: string }) {
  return (
    <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-72 shrink-0 flex-col border-r bg-surface md:flex">
      <nav aria-label="Chapters" className="flex-1 space-y-3 overflow-y-auto p-2">
        {groups.map((group) => {
          const labelId = `write-act-${group.key}`
          return (
            <div key={group.key}>
              {group.label && (
                <p
                  id={labelId}
                  className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide break-words text-muted-foreground uppercase"
                >
                  {group.label}
                </p>
              )}
              <ol aria-labelledby={group.label ? labelId : undefined} className="space-y-0.5">
                {group.chapters.map(({ chapter, number }) => {
                  const status = statusOf(chapter.status)
                  const title = chapterTitle(chapter.title)
                  return (
                    <li key={chapter.id}>
                      <NavLink
                        to={`/b/${bookId}/write/${chapter.id}`}
                        aria-current={chapter.id === activeId ? "page" : undefined}
                        aria-label={`Chapter ${number}: ${title}, ${status.label}, ${formatCount(chapter.words)} words`}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11",
                          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          chapter.id === activeId && "bg-accent font-medium text-ink",
                        )}
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", status.dot)} title={status.label} />
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {number}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            !chapter.title?.trim() && "text-muted-foreground italic",
                          )}
                        >
                          {title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatCount(chapter.words)}
                        </span>
                      </NavLink>
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </nav>
      {import.meta.env.DEV && (
        <div className="border-t p-3 text-xs text-muted-foreground">
          Dev: <Link to="/lab/ime" className="underline underline-offset-2 hover:text-ink">IME lab</Link>
        </div>
      )}
    </aside>
  )
}

interface ChapterViewProps {
  bookId: string
  chapter: ChapterListRow
  number: number
  groups: NavGroup[]
}

function ChapterView({ bookId, chapter, number, groups }: ChapterViewProps) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const scenes = useQuery<SceneListRow>(SCENES_SQL, [chapter.id])
  const matcher = useMentionMatcher(bookId)
  const status = statusOf(chapter.status)
  const isEmpty = !scenes.isLoading && scenes.data.length === 0

  useEffect(() => {
    if (isEmpty) ensureScene(db, chapter.id).catch((error) => console.error("[write] ensureScene", error))
  }, [db, chapter.id, isEmpty])

  return (
    <section data-write-chapter={chapter.id} className="min-w-0 flex-1">
      <div className="sticky top-14 z-10 border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
        <label className="sr-only" htmlFor="chapter-picker">
          Chapter
        </label>
        <select
          id="chapter-picker"
          value={chapter.id}
          onChange={(event) => navigate(`/b/${bookId}/write/${event.target.value}`)}
          className="h-11 w-full rounded-md border bg-surface px-3 text-base"
        >
          {groups.map((group) => {
            const options = group.chapters.map(({ chapter: option, number: optionNumber }) => (
              <option key={option.id} value={option.id}>
                {optionNumber}. {chapterTitle(option.title)}
              </option>
            ))
            return group.label ? (
              <optgroup key={group.key} label={group.label}>
                {options}
              </optgroup>
            ) : (
              <Fragment key={group.key}>{options}</Fragment>
            )
          })}
        </select>
      </div>
      <article className="prose-page mx-auto px-5 pt-10 pb-32 md:px-8">
        <header className="mb-10 font-sans">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              <span>Chapter {number}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", status.dot)} />
                {status.label}
              </span>
            </div>
            <Link
              to={`/b/${bookId}/plan?chapter=${chapter.id}`}
              aria-label={`Plan chapter ${number}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "-my-1 ml-auto shrink-0 text-ink-2 pointer-coarse:px-3",
              )}
            >
              <LayoutGridIcon />
              Plan
            </Link>
          </div>
          <h1
            className={cn(
              "mt-2 font-heading text-3xl leading-tight font-semibold text-ink",
              !chapter.title?.trim() && "font-normal text-muted-foreground italic",
            )}
          >
            {chapterTitle(chapter.title)}
          </h1>
          {chapter.summary && <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{chapter.summary}</div>}
          <div className="mt-3 text-xs text-muted-foreground tabular-nums">
            {formatCount(chapter.words)}
            {chapter.word_target ? ` / ${formatCount(chapter.word_target)}` : ""} words
          </div>
        </header>
        {scenes.data.map((scene, sceneIndex) => (
          <SceneBlock key={scene.id} scene={scene} index={sceneIndex} matcher={matcher} />
        ))}
      </article>
    </section>
  )
}

function SceneBlock({ scene, index, matcher }: { scene: SceneListRow; index: number; matcher: MentionMatcher }) {
  const provider = useSceneDoc(scene.id)
  const words = useSceneWords(provider) ?? scene.word_count ?? 0
  const title = scene.title || `Scene ${index + 1}`
  const label = scene.is_implicit ? "Chapter text" : title

  return (
    <section aria-label={label} data-scene-id={scene.id}>
      {index > 0 && (
        <div aria-hidden="true" className="my-10 text-center text-muted-foreground select-none">
          ⁂
        </div>
      )}
      {!scene.is_implicit && (
        <header className="mb-3 flex items-baseline justify-between gap-3 font-sans text-xs text-muted-foreground">
          <h2 className="font-semibold tracking-wider uppercase">{title}</h2>
          <span className="tabular-nums">{formatCount(words)} words</span>
        </header>
      )}
      {provider ? (
        <SceneEditor provider={provider} matcher={matcher} label={label} />
      ) : (
        <div className="h-40 animate-pulse rounded-md bg-surface-2/60" aria-busy="true" aria-label="Loading scene" />
      )}
    </section>
  )
}
