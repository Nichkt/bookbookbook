import { Extension } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { EMPTY_MATCHER, type MentionMatcher } from "../mentions"

interface MentionState {
  matcher: MentionMatcher
  decorations: DecorationSet
  /** The doc or matcher changed since the decorations were computed; they've only been mapped. */
  stale: boolean
}

interface MentionMeta {
  matcher?: MentionMatcher
  refresh?: true
}

export const mentionHighlightKey = new PluginKey<MentionState>("mentionHighlight")

export interface MentionHighlightOptions {
  matcher: MentionMatcher
  /**
   * Hold highlights still while an IME is composing and recompute once it's done (DESIGN.md §16). Re-wrapping the
   * text under a composition is what makes Android keyboards duplicate letters or drop words. Turn this off only to
   * reproduce that in the IME lab.
   */
  guardComposition: boolean
  /** Quiet time after the last change before highlights are recomputed. */
  idleMs: number
}

/** Auto-mention decorations for every textblock. Inline nodes count as opaque characters, so offsets map 1:1. */
export function findMentionDecorations(doc: ProseMirrorNode, matcher: MentionMatcher): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ""
    node.forEach((child) => {
      text += child.isText ? child.text! : "\uFFFC".repeat(child.nodeSize)
    })
    for (const match of matcher.find(text)) {
      decorations.push(
        Decoration.inline(pos + 1 + match.from, pos + 1 + match.to, {
          class: "mention-auto",
          "data-entry-id": match.entryId,
        }),
      )
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}

export function mentionHighlightPlugin(options: MentionHighlightOptions): Plugin<MentionState> {
  let schedule: (() => void) | undefined

  return new Plugin<MentionState>({
    key: mentionHighlightKey,
    state: {
      init: (_, state) => ({
        matcher: options.matcher,
        decorations: findMentionDecorations(state.doc, options.matcher),
        stale: false,
      }),
      apply(tr, prev) {
        const meta = tr.getMeta(mentionHighlightKey) as MentionMeta | undefined
        const matcher = meta?.matcher ?? prev.matcher
        const changed = tr.docChanged || matcher !== prev.matcher
        if (meta?.refresh || (changed && !options.guardComposition)) {
          return { matcher, decorations: findMentionDecorations(tr.doc, matcher), stale: false }
        }
        if (!changed) return prev
        // Mapping keeps every existing highlight on the same characters, so the DOM under the caret stays put.
        const decorations = tr.docChanged ? prev.decorations.map(tr.mapping, tr.doc) : prev.decorations
        return { matcher, decorations, stale: true }
      },
    },
    props: {
      decorations: (state) => mentionHighlightKey.getState(state)?.decorations,
      handleDOMEvents: {
        compositionend: () => {
          schedule?.()
          return false
        },
      },
    },
    view(view) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const refresh = () => {
        timer = undefined
        // Still composing: the next compositionend schedules another try.
        if (view.isDestroyed || view.composing || !mentionHighlightKey.getState(view.state)?.stale) return
        view.dispatch(view.state.tr.setMeta(mentionHighlightKey, { refresh: true } satisfies MentionMeta))
      }
      schedule = () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, options.idleMs)
      }
      if (mentionHighlightKey.getState(view.state)?.stale) schedule()
      return {
        update(updated) {
          if (mentionHighlightKey.getState(updated.state)?.stale) schedule?.()
        },
        destroy() {
          clearTimeout(timer)
          schedule = undefined
        },
      }
    },
  })
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mentionHighlight: {
      /** Swaps in a new matcher (codex entries changed). Highlights refresh on the next quiet moment. */
      setMentionMatcher: (matcher: MentionMatcher) => ReturnType
    }
  }
}

/** Auto-mention highlights as decorations: nothing is stored in the prose (DESIGN.md §7). */
export const MentionHighlight = Extension.create<MentionHighlightOptions>({
  name: "mentionHighlight",

  addOptions() {
    return { matcher: EMPTY_MATCHER, guardComposition: true, idleMs: 150 }
  },

  addCommands() {
    return {
      setMentionMatcher:
        (matcher) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(mentionHighlightKey, { matcher } satisfies MentionMeta)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [mentionHighlightPlugin(this.options)]
  },
})
