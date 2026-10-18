import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { describe, expect, test } from "vitest"
import { readAloudKey, readAloudPlugin, readingRange } from "./ReadAloud"

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
  },
})

// "Mara ran." is 1–10 and "Jonas waited." 11–24.
function reading() {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Mara ran. Jonas waited.")])])
  const state = EditorState.create({ doc, plugins: [readAloudPlugin()] })
  return state.apply(state.tr.setMeta(readAloudKey, { from: 11, to: 24 }))
}

const marked = (state: EditorState) => {
  const range = readingRange(state)
  return range && state.doc.textBetween(range.from, range.to)
}

describe("read aloud's mark", () => {
  test("marks the sentence and its paragraph, until cleared", () => {
    const state = reading()
    expect(marked(state)).toBe("Jonas waited.")
    const decorations = readAloudKey.getState(state)!.decorations.find()
    expect(decorations.map((decoration) => [decoration.from, decoration.to])).toEqual([
      [0, 25],
      [11, 24],
    ])
    const cleared = state.apply(state.tr.setMeta(readAloudKey, null))
    expect(readingRange(cleared)).toBeNull()
    expect(readAloudKey.getState(cleared)!.decorations.find()).toEqual([])
  })

  test("stays on its words through edits, with text typed at either end left outside", () => {
    let state = reading()
    state = state.apply(state.tr.insertText("Then ", 1))
    expect(marked(state)).toBe("Jonas waited.")
    const { from, to } = readingRange(state)!
    state = state.apply(state.tr.insertText("Old ", from))
    state = state.apply(state.tr.insertText(" Long.", to + 4))
    expect(marked(state)).toBe("Jonas waited.")
    state = state.apply(state.tr.insertText(" patiently", readingRange(state)!.to - 1))
    expect(marked(state)).toBe("Jonas waited patiently.")
  })

  test("is left empty where the sentence was when it's deleted whole", () => {
    let state = reading()
    state = state.apply(state.tr.delete(10, 24))
    expect(readingRange(state)).toEqual({ from: 10, to: 10 })
  })
})
