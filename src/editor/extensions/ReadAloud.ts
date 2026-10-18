import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

/*
 * Read aloud's mark on the sentence being spoken (DESIGN.md §8 "Writing aids"). A decoration, so nothing is stored,
 * mapped through edits so it stays on the same words. The block it's in is marked too, so focus mode doesn't dim it.
 */

export interface ReadingRange {
  from: number
  to: number
}

interface ReadingState {
  range: ReadingRange | null
  decorations: DecorationSet
}

export const readAloudKey = new PluginKey<ReadingState>("readAloud")

const NOT_READING: ReadingState = { range: null, decorations: DecorationSet.empty }

function reading(doc: ProseMirrorNode, range: ReadingRange): ReadingState {
  const decorations = [Decoration.inline(range.from, range.to, { class: "read-aloud" })]
  const $from = doc.resolve(range.from)
  if ($from.parent.isTextblock && $from.depth > 0) {
    decorations.push(Decoration.node($from.before(), $from.after(), { class: "is-reading" }))
  }
  return { range, decorations: DecorationSet.create(doc, decorations) }
}

export function readAloudPlugin(): Plugin<ReadingState> {
  return new Plugin<ReadingState>({
    key: readAloudKey,
    state: {
      init: () => NOT_READING,
      apply(tr, prev) {
        const meta = tr.getMeta(readAloudKey) as ReadingRange | null | undefined
        if (meta !== undefined) return meta ? reading(tr.doc, meta) : NOT_READING
        if (!tr.docChanged || !prev.range) return prev
        // Text typed at either end stays outside. A sentence deleted whole leaves the place it was.
        const from = tr.mapping.map(prev.range.from, 1)
        const to = Math.max(from, tr.mapping.map(prev.range.to, -1))
        return reading(tr.doc, { from, to })
      },
    },
    props: {
      decorations: (state) => readAloudKey.getState(state)?.decorations,
    },
  })
}

/** The sentence an editor is reading, as edits since have moved it. */
export const readingRange = (state: EditorState): ReadingRange | null => readAloudKey.getState(state)?.range ?? null

/** Marks the sentence being read in an editor, or with null clears the mark. */
export function showReading(editor: Editor, range: ReadingRange | null) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(readAloudKey, range))
}

export const ReadAloudHighlight = Extension.create({
  name: "readAloudHighlight",
  addProseMirrorPlugins() {
    return [readAloudPlugin()]
  },
})
