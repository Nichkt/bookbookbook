import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/*
 * Typewriter scrolling (DESIGN.md §8 "Writing aids"): while it's on, the line being written stays halfway down the
 * part of the window the text shows in, as on a typewriter, rather than creeping down to the bottom edge.
 */

let enabled = false

/** Turns typewriter scrolling on or off for every scene editor. */
export function setTypewriterScrolling(on: boolean) {
  enabled = on
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The middle of the text's part of the window: below the Write toolbar, and above a phone's keyboard and the tools
 * docked on it.
 */
function writingLine(): number {
  const viewport = window.visualViewport
  const toolbar = document.querySelector("[data-write-toolbar]")?.getBoundingClientRect().bottom ?? 0
  const top = Math.max(toolbar, viewport?.offsetTop ?? 0)
  const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
  const docked = document.querySelector("[data-docked-tools]")?.getBoundingClientRect().top ?? bottom
  return (top + Math.min(bottom, docked)) / 2
}

/** Scrolls the window so the caret's line sits on the writing line. Leaves a selection being made alone. */
export function centerCaret(view: EditorView) {
  if (view.isDestroyed || !view.hasFocus() || !view.state.selection.empty) return
  const coords = view.coordsAtPos(view.state.selection.head)
  const delta = (coords.top + coords.bottom) / 2 - writingLine()
  if (Math.abs(delta) < 2) return
  window.scrollTo({ top: window.scrollY + delta, behavior: reducedMotion() ? "instant" : "smooth" })
}

export const Typewriter = Extension.create({
  name: "typewriter",
  addProseMirrorPlugins() {
    const key = new PluginKey<boolean>("typewriter")
    return [
      new Plugin<boolean>({
        key,
        // Whether the selection was last put by the pointer: a click or a drag mustn't pull the page from under it.
        state: {
          init: () => false,
          apply: (tr, byPointer) => (tr.getMeta("pointer") ? true : tr.docChanged || tr.selectionSet ? false : byPointer),
        },
        view: () => {
          let frame = 0
          return {
            update: (view, previous) => {
              // Mid-composition the IME's own window is anchored to the caret: scroll once it's done.
              if (!enabled || view.composing || key.getState(view.state)) return
              if (previous.doc === view.state.doc && previous.selection.eq(view.state.selection)) return
              // After ProseMirror's own scrolling into view, which follows the plugin views' updates.
              cancelAnimationFrame(frame)
              frame = requestAnimationFrame(() => centerCaret(view))
            },
            destroy: () => cancelAnimationFrame(frame),
          }
        },
      }),
    ]
  },
})
