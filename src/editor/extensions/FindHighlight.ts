import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { docMatches, type TextRange } from "../find"

/*
 * Find and replace's marks on a scene's matches (DESIGN.md §8 "Writing aids"), with the one the panel is on marked
 * apart. Decorations, so nothing is stored, found again in the text after each edit.
 */

interface FindState {
  regex: RegExp | null
  current: TextRange | null
  decorations: DecorationSet
}

/** What the find panel tells an editor: what to search for, and which match it's on. What's left out stays. */
export interface FindMeta {
  regex?: RegExp | null
  current?: TextRange | null
}

export const findKey = new PluginKey<FindState>("find")

/** No more marks than this in one scene. */
const MARK_LIMIT = 10_000

const NOT_FINDING: FindState = { regex: null, current: null, decorations: DecorationSet.empty }

const same = (a: TextRange, b: TextRange) => a.from === b.from && a.to === b.to

function finding(doc: ProseMirrorNode, regex: RegExp | null, current: TextRange | null): FindState {
  if (!regex) return NOT_FINDING
  const matches = docMatches(doc, regex, MARK_LIMIT)
  // Edited so it no longer matches, the match the panel was on is just text again.
  const on = current && matches.some((match) => same(match, current)) ? current : null
  const decorations = matches.map((match) => {
    const current = !!on && same(match, on)
    return Decoration.inline(
      match.from,
      match.to,
      { class: current ? "find-match find-match-current" : "find-match" },
      { current },
    )
  })
  return { regex, current: on, decorations: DecorationSet.create(doc, decorations) }
}

export function findPlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => NOT_FINDING,
      apply(tr, prev) {
        const meta = tr.getMeta(findKey) as FindMeta | undefined
        if (!meta && !(tr.docChanged && prev.regex)) return prev
        const regex = meta && "regex" in meta ? (meta.regex ?? null) : prev.regex
        let current = meta && "current" in meta ? (meta.current ?? null) : prev.current
        if (tr.docChanged && current && !(meta && "current" in meta)) {
          const from = tr.mapping.map(current.from, 1)
          const to = tr.mapping.map(current.to, -1)
          current = to > from ? { from, to } : null
        }
        return finding(tr.doc, regex, current)
      },
    },
    props: {
      decorations: (state) => findKey.getState(state)?.decorations,
    },
  })
}

/** The match the find panel is on in an editor, where edits since have moved it; null when it's on none there. */
export const currentFind = (state: EditorState): TextRange | null => findKey.getState(state)?.current ?? null

/** Tells an editor what the find panel is searching for, or which match it's on. */
export function showFind(editor: Editor, meta: FindMeta) {
  if (editor.isDestroyed) return
  const state = findKey.getState(editor.state)
  if (!state) return
  const regex = "regex" in meta ? (meta.regex ?? null) : state.regex
  const current = "current" in meta ? (meta.current ?? null) : state.current
  const unchanged =
    regex === state.regex && (current === state.current || (current && state.current && same(current, state.current)))
  if (unchanged) return
  editor.view.dispatch(editor.state.tr.setMeta(findKey, meta))
}

export const FindHighlight = Extension.create({
  name: "findHighlight",
  addProseMirrorPlugins() {
    return [findPlugin()]
  },
})
