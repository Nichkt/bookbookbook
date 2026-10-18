import { Fragment, useEffect, useLayoutEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router"
import type { PlanChapter } from "@/features/plan/planData"
import { actLabel } from "@/features/plan/status"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { ChapterHeader } from "./ChapterPage"
import { holdingView, holdInView, revealScene, useEnsureScene, useNearViewport } from "./pageHooks"
import { SceneBlock } from "./SceneBlock"
import { navState, useWrite, writePath, type WriteNavState } from "./writeContext"

/**
 * The Manuscript view: the whole book as one page (DESIGN.md §8). Scenes get their editors as they come near the
 * viewport, and the URL follows the chapter being read, so the navigator, the chapter plan and a reload keep up.
 */
export function Manuscript() {
  const { bookId, book, plan, chapterId, sceneId } = useWrite()
  const location = useLocation()
  const navigate = useNavigate()

  // The chapter the URL names. Scrolling past a chapter changes the URL, which needs no scrolling in return.
  const named = useRef(chapterId)
  useLayoutEffect(() => {
    named.current = chapterId
  })

  const arrived = useRef(false)
  useEffect(() => {
    const { focus, followed } = navState(location.state)
    if (followed && arrived.current) return
    arrived.current = true
    if (sceneId) return revealScene(sceneId, focus === "scene")
    if (focus === "heading") focusSoon(byData("write-heading", chapterId))
    if (chapterId !== plan.chapters[0]?.id) return holdInView(byData("write-chapter", chapterId))
    window.scrollTo(0, 0)
    return undefined
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps -- on arrival only

  useEffect(() => {
    let frame = 0
    const follow = () => {
      // While an arrival holds the page still, it's at the chapter it arrived at: look again once it lets go.
      if (holdingView()) {
        frame = requestAnimationFrame(follow)
        return
      }
      frame = 0
      // The chapter being read: the last one to start above a line a quarter of the way down the window.
      const line = Math.max(window.innerHeight * 0.25, 160)
      const sections = document.querySelectorAll<HTMLElement>("[data-write-chapter]")
      let reading = sections[0]
      for (const section of sections) {
        if (section.getBoundingClientRect().top > line) break
        reading = section
      }
      const id = reading?.dataset.writeChapter
      if (!id || id === named.current) return
      named.current = id
      const state: WriteNavState = { followed: true }
      navigate(writePath(bookId, id), { replace: true, state })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(follow)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [bookId, navigate])

  return (
    <article className="prose-page mx-auto px-5 pt-10 pb-[50vh] md:px-8">
      <header data-focus-dim="" className="mb-6 font-sans">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Manuscript</p>
        <h1 className="mt-2 font-heading text-4xl leading-tight font-semibold text-ink">
          {book.title?.trim() || "Untitled book"}
        </h1>
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          {plan.chapters.length} {plan.chapters.length === 1 ? "chapter" : "chapters"} · {formatCount(plan.words)}
          {book.target_words ? ` / ${formatCount(book.target_words)}` : ""} words
        </p>
      </header>
      {plan.groups.map((group) =>
        group.chapters.length === 0 ? null : (
          <Fragment key={group.key}>
            {plan.hasActs && (
              <p
                data-focus-dim=""
                className="mt-20 text-center font-sans text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase"
              >
                {actLabel(group, plan.hasActs)}
              </p>
            )}
            {group.chapters.map((chapter) => (
              <ManuscriptChapter key={chapter.id} chapter={chapter} />
            ))}
          </Fragment>
        ),
      )}
    </article>
  )
}

function ManuscriptChapter({ chapter }: { chapter: PlanChapter }) {
  const section = useRef<HTMLElement>(null)
  const near = useNearViewport(section, true)
  useEnsureScene(chapter, near)
  return (
    <section ref={section} data-write-chapter={chapter.id} className="scroll-mt-32 pt-16">
      <ChapterHeader chapter={chapter} level={2} />
      {chapter.scenes.map((scene, index) => (
        <SceneBlock
          key={scene.id}
          chapter={chapter}
          scene={scene}
          index={index}
          divider={index > 0}
          headingLevel={3}
          lazy
        />
      ))}
    </section>
  )
}
