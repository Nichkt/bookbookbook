import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { describe, expect, test } from "vitest"
import { currentFind, findKey, findPlugin, type FindMeta } from "./FindHighlight"

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
  },
})

// "Mara" is at 1–5 and 17–21.
function searching(meta: FindMeta = { regex: /mara/giu }) {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Mara met Jonas. Mara left.")])])
  const state = EditorState.create({ doc, plugins: [findPlugin()] })
  return state.apply(state.tr.setMeta(findKey, meta))
}

const marks = (state: EditorState) =>
  findKey
    .getState(state)!
    .decorations.find()
    .map((decoration) => [state.doc.textBetween(decoration.from, decoration.to), !!decoration.spec.current])

describe("find's marks", () => {
  test("mark every match, and the one the panel is on apart", () => {
    let state = searching()
    expect(marks(state)).toEqual([
      ["Mara", false],
      ["Mara", false],
    ])
    state = state.apply(state.tr.setMeta(findKey, { current: { from: 17, to: 21 } }))
    expect(marks(state).map(([, current]) => current)).toEqual([false, true])
    expect(currentFind(state)).toEqual({ from: 17, to: 21 })
  })

  test("follow edits, finding new matches and keeping the current one while it still matches", () => {
    let state = searching({ regex: /mara/giu, current: { from: 17, to: 21 } })
    state = state.apply(state.tr.insertText("Mara! ", 1))
    expect(marks(state)).toHaveLength(3)
    expect(currentFind(state)).toEqual({ from: 23, to: 27 })
    state = state.apply(state.tr.insertText("x", 25))
    expect(currentFind(state)).toBeNull()
    expect(marks(state)).toHaveLength(2)
  })

  test("go when the search is cleared", () => {
    let state = searching({ regex: /mara/giu, current: { from: 1, to: 5 } })
    state = state.apply(state.tr.setMeta(findKey, { regex: null }))
    expect(marks(state)).toEqual([])
    expect(currentFind(state)).toBeNull()
    state = state.apply(state.tr.insertText("Mara ", 1))
    expect(marks(state)).toEqual([])
  })
})
