import { useEffect, useState, type RefObject } from "react"
import { attempt } from "@/app/feedback"
import { ensureScene } from "@/db/queries"
import { whenEditor } from "@/editor/activeEditor"
import type { PlanChapter, PlanSceneRow } from "@/features/plan/planData"
import { byData } from "@/lib/focus"
import { estimatedHeight } from "./sequence"
import { useWriteBasics } from "./writeContext"

/** A chapter gets its one implicit scene the first time it's opened (DESIGN.md §5). */
export function useEnsureScene(chapter: PlanChapter, enabled = true) {
  const { db } = useWriteBasics()
  const empty = chapter.scenes.length === 0
  useEffect(() => {
    if (enabled && empty) void attempt("open chapter", ensureScene(db, chapter.id))
  }, [db, chapter.id, empty, enabled])
}

/** The writer's own moves, at the first of which an arrival lets go of the page. */
const TAKEOVER = ["wheel", "touchstart", "pointerdown", "keydown"] as const
/**
 * An arrival lets go once the page has kept still for SETTLED_MS with no scene near the window still loading its text
 * (which will change its height), and after HOLD_MAX_MS whatever happens.
 */
const SETTLED_MS = 1000
const HOLD_MAX_MS = 5000
const LOADING_SCENE = "[data-scene-loading]"

let holds = 0
/** Whether an arrival is holding the page still (see holdInView): following the scroll waits until it lets go. */
export const holdingView = () => holds > 0

/**
 * Scrolls an element's top into view and keeps it there while the page settles: after a jump, the scenes around it
 * get their editors, and their text seldom takes the height guessed for it. Chrome's scroll anchoring can't be relied
 * on to make up for that (it may anchor to a placeholder that's about to go), and Safari has none. Lets go at the
 * writer's first wheel, touch, click or key. Returns a function that lets go, for effect cleanups. Rather than an
 * element's selector, `target` can be what scrolls whatever it is into view.
 */
export function holdInView(target: string | (() => void)): () => void {
  const scroll =
    typeof target === "string" ? () => document.querySelector(target)?.scrollIntoView({ block: "start" }) : target
  let quiet = 0
  let limit = 0
  let held = true
  const settle = () => {
    window.clearTimeout(quiet)
    quiet = window.setTimeout(() => (document.querySelector(LOADING_SCENE) ? settle() : release()), SETTLED_MS)
  }
  const observer = new ResizeObserver(() => {
    scroll()
    settle()
  })
  const release = () => {
    if (!held) return
    held = false
    holds--
    observer.disconnect()
    window.clearTimeout(quiet)
    window.clearTimeout(limit)
    for (const type of TAKEOVER) window.removeEventListener(type, release, true)
  }
  holds++
  scroll()
  observer.observe(document.body)
  limit = window.setTimeout(release, HOLD_MAX_MS)
  for (const type of TAKEOVER) window.addEventListener(type, release, { capture: true, passive: true })
  return release
}

/**
 * Scrolls a scene's top into view and keeps it there while the page settles (see holdInView). With `focus`, puts the
 * caret at its start once its editor is up. Returns a cancel function, for effect cleanups.
 */
export function revealScene(sceneId: string, focus: boolean): () => void {
  const release = holdInView(byData("scene-id", sceneId))
  if (!focus) return release
  const cancel = whenEditor(sceneId, ({ editor }) => editor.commands.focus("start", { scrollIntoView: false }))
  return () => {
    release()
    cancel()
  }
}

/*
 * The manuscript keeps editors only near the viewport: one mounts when its scene comes within MOUNT_MARGIN, and goes
 * once the scene is beyond UNMOUNT_MARGIN, so scrolling back and forth doesn't churn. Never while it has focus.
 */
const MOUNT_MARGIN = "1000px 0px"
const UNMOUNT_MARGIN = "3000px 0px"

type Listener = (entry: IntersectionObserverEntry) => void
const observers = new Map<string, { observer: IntersectionObserver; listeners: Map<Element, Listener> }>()

function observe(margin: string, element: Element, listener: Listener): () => void {
  let shared = observers.get(margin)
  if (!shared) {
    const listeners = new Map<Element, Listener>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) listeners.get(entry.target)?.(entry)
      },
      { rootMargin: margin },
    )
    shared = { observer, listeners }
    observers.set(margin, shared)
  }
  const { observer, listeners } = shared
  listeners.set(element, listener)
  observer.observe(element)
  return () => {
    listeners.delete(element)
    observer.unobserve(element)
  }
}

/** Whether the element is near the viewport; always true unless `lazy`. */
export function useNearViewport(ref: RefObject<HTMLElement | null>, lazy: boolean): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!lazy || !element) return
    const stopNear = observe(MOUNT_MARGIN, element, (entry) => {
      if (entry.isIntersecting) setNear(true)
    })
    const stopFar = observe(UNMOUNT_MARGIN, element, (entry) => {
      if (!entry.isIntersecting && !element.contains(document.activeElement)) setNear(false)
    })
    return () => {
      stopNear()
      stopFar()
    }
  }, [ref, lazy])
  return near || !lazy
}

/** The measured height of each scene's text, so a scene without its editor holds the space it took. */
const heights = new Map<string, number>()

/** How tall a scene's text stands without its editor: as tall as it last measured, or as long as its words suggest. */
export const sceneTextHeight = (scene: Readonly<PlanSceneRow>) =>
  heights.get(scene.id) ?? estimatedHeight(scene.word_count)

/** Keeps the height of a scene's text while its editor is there. */
export function useRememberHeight(ref: RefObject<HTMLElement | null>, sceneId: string, active: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!active || !element) return
    const observer = new ResizeObserver(() => {
      if (element.offsetHeight > 0) heights.set(sceneId, element.offsetHeight)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, sceneId, active])
}
