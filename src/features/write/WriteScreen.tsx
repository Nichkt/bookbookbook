import { usePowerSync, useQuery } from "@powersync/react"
import { useEffect } from "react"
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router"
import { rememberBook } from "@/app/books"
import { CHAPTERS_SQL, ensureScene, SCENES_SQL, type ChapterListRow, type SceneListRow } from "@/db/queries"
import type { ChapterStatus } from "@/db/schema"
import type { MentionMatcher } from "@/editor/mentions"
import { SceneEditor } from "@/editor/SceneEditor"
import { useMentionMatcher } from "@/editor/useMentionMatcher"
import { useSceneDoc, useSceneWords } from "@/editor/useSceneDoc"
import { cn } from "@/lib/utils"

const STATUS: Record<ChapterStatus, { label: string; dot: string }> = {
  idea: { label: "Idea", dot: "bg-status-idea" },
  outlined: { label: "Outlined", dot: "bg-status-outlined" },
  drafting: { label: "Drafting", dot: "bg-status-drafting" },
  revising: { label: "Revising", dot: "bg-status-revising" },
  done: { label: "Done", dot: "bg-status-done" },
}

const statusOf = (chapter: ChapterListRow) => STATUS[chapter.status ?? "idea"] ?? STATUS.idea
const chapterTitle = (chapter: ChapterListRow, index: number) => chapter.title || `Chapter ${index + 1}`
const lastChapterKey = (bookId: string) => `bbb.lastChapter.${bookId}`

function readLastChapter(bookId: string) {
  try {
    return localStorage.getItem(lastChapterKey(bookId))
  } catch {
    return null
  }
}

/** Write screen, M0 cut: chapter list plus the chapter's scenes as stacked editors (DESIGN.md §8). */
export function WriteScreen() {
  const { bookId = "", chapterId } = useParams()
  const chapters = useQuery<ChapterListRow>(CHAPTERS_SQL, [bookId])

  useEffect(() => {
    rememberBook(bookId)
    if (!chapterId) return
    try {
      localStorage.setItem(lastChapterKey(bookId), chapterId)
    } catch {
      // Only a convenience.
    }
  }, [bookId, chapterId])

  if (chapters.isLoading) return null
  if (!chapterId) {
    const last = readLastChapter(bookId)
    const target = chapters.data.find((chapter) => chapter.id === last) ?? chapters.data[0]
    if (target) return <Navigate to={`/b/${bookId}/write/${target.id}`} replace />
    return <p className="p-8 text-muted-foreground">This book has no chapters yet. The planner arrives in M1.</p>
  }

  const index = chapters.data.findIndex((chapter) => chapter.id === chapterId)
  return (
    <div className="flex flex-1">
      <ChapterList bookId={bookId} chapters={chapters.data} activeId={chapterId} />
      {index === -1 ? (
        <p className="p-8 text-muted-foreground">That chapter isn't in this book.</p>
      ) : (
        <ChapterView
          key={chapterId}
          bookId={bookId}
          chapter={chapters.data[index]}
          index={index}
          chapters={chapters.data}
        />
      )}
    </div>
  )
}

function ChapterList({ bookId, chapters, activeId }: { bookId: string; chapters: ChapterListRow[]; activeId: string }) {
  return (
    <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-72 shrink-0 flex-col border-r bg-surface md:flex">
      <nav aria-label="Chapters" className="flex-1 overflow-y-auto p-2">
        <ol className="space-y-0.5">
          {chapters.map((chapter, index) => {
            const status = statusOf(chapter)
            return (
              <li key={chapter.id}>
                <NavLink
                  to={`/b/${bookId}/write/${chapter.id}`}
                  aria-current={chapter.id === activeId ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-accent hover:text-ink",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    chapter.id === activeId && "bg-accent font-medium text-ink",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", status.dot)} title={status.label} />
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{chapterTitle(chapter, index)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {chapter.words.toLocaleString()}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ol>
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
  index: number
  chapters: ChapterListRow[]
}

function ChapterView({ bookId, chapter, index, chapters }: ChapterViewProps) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const scenes = useQuery<SceneListRow>(SCENES_SQL, [chapter.id])
  const matcher = useMentionMatcher(bookId)
  const status = statusOf(chapter)
  const isEmpty = !scenes.isLoading && scenes.data.length === 0

  useEffect(() => {
    if (isEmpty) ensureScene(db, chapter.id).catch((error) => console.error("[write] ensureScene", error))
  }, [db, chapter.id, isEmpty])

  return (
    <section className="min-w-0 flex-1">
      <div className="sticky top-14 z-10 border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
        <label className="sr-only" htmlFor="chapter-picker">
          Chapter
        </label>
        <select
          id="chapter-picker"
          value={chapter.id}
          onChange={(event) => navigate(`/b/${bookId}/write/${event.target.value}`)}
          className="h-11 w-full rounded-md border bg-surface px-3 text-sm"
        >
          {chapters.map((option, optionIndex) => (
            <option key={option.id} value={option.id}>
              {optionIndex + 1}. {chapterTitle(option, optionIndex)}
            </option>
          ))}
        </select>
      </div>
      <article className="prose-page mx-auto px-5 pt-10 pb-32 md:px-8">
        <header className="mb-10 font-sans">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            <span>Chapter {index + 1}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", status.dot)} />
              {status.label}
            </span>
          </div>
          <h1 className="mt-2 font-heading text-3xl leading-tight font-semibold text-ink">
            {chapterTitle(chapter, index)}
          </h1>
          {chapter.summary && <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{chapter.summary}</div>}
          <div className="mt-3 text-xs text-muted-foreground tabular-nums">
            {chapter.words.toLocaleString()}
            {chapter.word_target ? ` / ${chapter.word_target.toLocaleString()}` : ""} words
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
          <span className="tabular-nums">{words.toLocaleString()} words</span>
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
