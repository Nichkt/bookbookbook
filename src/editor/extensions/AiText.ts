import { Mark, mergeAttributes } from "@tiptap/core"
import { Fragment, Slice, type MarkType, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { ySyncPluginKey } from "@tiptap/y-tiptap"
import { AI_MARK } from "@/yjs/prose"

/*
 * Text an AI tool wrote carries the `aiGenerated` mark, shown as a soft tint (DESIGN.md §8 "Provenance and stats").
 * What the writer types into it is theirs: the mark comes off just what they typed. Text that arrives from Yjs (an
 * undo, another tab, a restored version) keeps the marks it has, as does text copied and pasted with its formatting.
 */

/** Meta on the transaction that puts an AI tool's text in: it keeps its mark. */
export const AI_INSERT_META = "aiInsert"

interface Range {
  from: number
  to: number
}

interface AiTextState {
  /** Text the writer put inside AI text, still to have the mark taken off: it waits while an IME is composing. */
  pending: readonly Range[]
}

export const aiTextKey = new PluginKey<AiTextState>("aiText")

/** The writer's own edit, rather than text from Yjs, an AI tool, or a paste or drop (see transformPasted). */
function writerEdit(tr: Transaction): boolean {
  if (tr.getMeta(AI_INSERT_META)) return false
  if ((tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin) return false
  const event = tr.getMeta("uiEvent")
  return event !== "paste" && event !== "drop"
}

/** Where in the transaction's doc its steps put new content. */
export function insertedRanges(tr: Transaction): Range[] {
  const ranges: Range[] = []
  tr.mapping.maps.forEach((map, index) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (newEnd <= newStart) return
      const later = tr.mapping.slice(index + 1)
      const from = later.map(newStart, 1)
      const to = later.map(newEnd, -1)
      if (to > from) ranges.push({ from, to })
    })
  })
  return ranges
}

/** A slice without the mark: for text pasted as plain text, which ProseMirror gives the marks at the caret. */
export function withoutMark(slice: Slice, type: MarkType): Slice {
  const strip = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = []
    fragment.forEach((node) => {
      nodes.push(node.isText ? node.mark(type.removeFromSet(node.marks)) : node.copy(strip(node.content)))
    })
    return Fragment.fromArray(nodes)
  }
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd)
}

export function aiTextPlugin(type: MarkType, settleMs = 50): Plugin<AiTextState> {
  let view: EditorView | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  return new Plugin<AiTextState>({
    key: aiTextKey,
    state: {
      init: () => ({ pending: [] }),
      apply(tr, prev) {
        if (!tr.docChanged) return prev
        let pending = prev.pending.map((range) => ({
          from: tr.mapping.map(range.from, 1),
          to: tr.mapping.map(range.to, -1),
        }))
        if (writerEdit(tr)) pending = [...pending, ...insertedRanges(tr)]
        pending = pending.filter((range) => range.to > range.from && tr.doc.rangeHasMark(range.from, range.to, type))
        return pending.length === 0 && prev.pending.length === 0 ? prev : { pending }
      },
    },
    appendTransaction(_transactions, _oldState, state) {
      const pending = aiTextKey.getState(state)?.pending ?? []
      // Changing the marks under a composition is what makes Android keyboards duplicate letters (DESIGN.md §16).
      if (pending.length === 0 || view?.composing) return null
      const tr = state.tr
      for (const range of pending) tr.removeMark(range.from, range.to, type)
      return tr
    },
    props: {
      transformPasted: (slice, _view, plain) => (plain ? withoutMark(slice, type) : slice),
      handleDOMEvents: {
        compositionend: () => {
          clearTimeout(timer)
          // After ProseMirror has read the composition's last change and stopped composing.
          timer = setTimeout(() => {
            if (!view || view.isDestroyed || view.composing) return
            if (aiTextKey.getState(view.state)?.pending.length) view.dispatch(view.state.tr)
          }, settleMs)
          return false
        },
      },
    },
    view(editorView) {
      view = editorView
      return {
        destroy() {
          clearTimeout(timer)
          view = undefined
        },
      }
    },
  })
}

/** The AI mark: a span with the `ai-generated` class, naming the card and model it came from. */
export const AiText = Mark.create({
  name: AI_MARK,
  // Typing just after AI text, or pressing Enter in it, isn't AI text.
  inclusive: false,
  keepOnSplit: false,

  addAttributes() {
    return {
      card: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ai-card"),
        renderHTML: (attributes) => (attributes.card ? { "data-ai-card": attributes.card } : {}),
      },
      model: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ai-model"),
        renderHTML: (attributes) => (attributes.model ? { "data-ai-model": attributes.model } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-ai]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-ai": "", class: "ai-generated" }, HTMLAttributes), 0]
  },

  addProseMirrorPlugins() {
    return [aiTextPlugin(this.type)]
  },
})
