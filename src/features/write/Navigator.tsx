import { useEffect, useRef } from "react"
import { Link } from "react-router"
import { ProgressBar } from "@/components/WordProgress"
import { actLabel, chapterTitle, statusOf } from "@/features/plan/status"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { sceneToShow } from "./sequence"
import { sceneLabel, useWrite, writePath, type WriteNavState } from "./writeContext"

export const NAVIGATOR_ID = "write-navigator"

const SCENE_STATE: WriteNavState = { focus: "scene" }

/** The book's chapters beside the text, under their acts, with the open chapter's scenes (DESIGN.md §8). */
export function Navigator() {
  const { bookId, book, plan, chapterId, sceneId, unit } = useWrite()
  const nav = useRef<HTMLElement>(null)
  const current = plan.chapterById.get(chapterId)
  const currentScene = current && unit === "scene" ? (sceneToShow(current, sceneId)?.id ?? null) : sceneId

  // Keeps the open chapter in view as it changes, e.g. while the manuscript scrolls. Not scrollIntoView, which would
  // scroll the page too.
  useEffect(() => {
    const list = nav.current
    const item = list?.querySelector('[aria-current="page"]')?.closest("li")
    if (!list || !item) return
    const box = list.getBoundingClientRect()
    const rect = item.getBoundingClientRect()
    if (rect.top < box.top || rect.height > box.height) list.scrollTop += rect.top - box.top - 8
    else if (rect.bottom > box.bottom) list.scrollTop += rect.bottom - box.bottom + 8
  }, [chapterId])

  return (
    <div
      id={NAVIGATOR_ID}
      className="sticky top-[6.5rem] hidden h-[calc(100svh-6.5rem)] w-72 shrink-0 flex-col border-r bg-surface md:flex pointer-coarse:top-28 pointer-coarse:h-[calc(100svh-7rem)]"
    >
      <nav ref={nav} aria-label="Chapters" className="flex-1 space-y-3 overflow-y-auto p-2">
        {plan.groups.map((group) => {
          if (group.chapters.length === 0) return null
          const labelId = `write-act-${group.key}`
          return (
            <div key={group.key}>
              {plan.hasActs && (
                <p
                  id={labelId}
                  className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide break-words text-muted-foreground uppercase"
                >
                  {actLabel(group, plan.hasActs)}
                </p>
              )}
              <ol aria-labelledby={plan.hasActs ? labelId : undefined} className="space-y-0.5">
                {group.chapters.map((chapter) => {
                  const status = statusOf(chapter.status)
                  const title = chapterTitle(chapter.title)
                  const open = chapter.id === chapterId
                  return (
                    <li key={chapter.id}>
                      <Link
                        to={writePath(bookId, chapter.id)}
                        aria-current={open ? "page" : undefined}
                        aria-label={`Chapter ${chapter.number}: ${title}, ${formatCount(chapter.words)} words, ${status.label}`}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11",
                          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          open && "bg-accent font-medium text-ink",
                        )}
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", status.dot)} title={status.label} />
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {chapter.number}
                        </span>{" "}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            !chapter.title?.trim() && "text-muted-foreground italic",
                          )}
                        >
                          {title}
                        </span>{" "}
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatCount(chapter.words)}
                        </span>
                      </Link>
                      {open && chapter.explicitScenes.length > 0 && (
                        <ol
                          aria-label={`Scenes of chapter ${chapter.number}`}
                          className="mt-0.5 mb-1.5 ml-[1.375rem] space-y-0.5 border-l pl-1.5"
                        >
                          {chapter.explicitScenes.map((scene, index) => {
                            const here = scene.id === currentScene
                            const name = sceneLabel(scene, index)
                            const words = formatCount(scene.word_count ?? 0)
                            return (
                              <li key={scene.id}>
                                <Link
                                  to={writePath(bookId, chapter.id, scene.id)}
                                  state={SCENE_STATE}
                                  aria-current={here ? "location" : undefined}
                                  aria-label={`Scene ${index + 1}${scene.title?.trim() ? `: ${name}` : ""}, ${words} words`}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11",
                                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                                    here && "font-medium text-ink",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "min-w-0 flex-1 truncate",
                                      !scene.title?.trim() && "text-muted-foreground italic",
                                    )}
                                  >
                                    {name}
                                  </span>{" "}
                                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{words}</span>
                                </Link>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </nav>
      <div className="space-y-2 border-t p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2 tabular-nums">
          <span className="font-medium text-ink-2">Book</span>
          <span>
            {formatCount(plan.words)}
            {book.target_words ? ` / ${formatCount(book.target_words)}` : ""} words
          </span>
        </div>
        {!!book.target_words && <ProgressBar value={plan.words} max={book.target_words} label="Book word count target" />}
        {import.meta.env.DEV && (
          <p>
            Dev:{" "}
            <Link to="/lab/ime" className="underline underline-offset-2 hover:text-ink">
              IME lab
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
