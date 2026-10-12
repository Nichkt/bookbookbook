import { Schema } from "@tiptap/pm/model"
import { EditorState, TextSelection } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"
import { buildMentionMatcher } from "../mentions"
import { findMentionDecorations, mentionHighlightKey, mentionHighlightPlugin } from "./MentionHighlight"

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
})

const matcher = buildMentionMatcher([
  { id: "mara", name: "Mara", aliases: [] },
  { id: "jonas", name: "Jonas Quill", aliases: ["Jonas"] },
])

function stateWith(text: string, guardComposition: boolean) {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text(text)])])
  return EditorState.create({ doc, plugins: [mentionHighlightPlugin({ matcher, guardComposition, idleMs: 150 })] })
}

const pluginState = (state: EditorState) => mentionHighlightKey.getState(state)!
const highlights = (state: EditorState) =>
  pluginState(state)
    .decorations.find()
    .sort((a, b) => a.from - b.from)
    .map((decoration) => state.doc.textBetween(decoration.from, decoration.to))
const typeAtEnd = (state: EditorState, text: string) => state.apply(state.tr.insertText(text, state.doc.content.size - 1))
const refresh = (state: EditorState) => state.apply(state.tr.setMeta(mentionHighlightKey, { refresh: true }))

describe("findMentionDecorations", () => {
  it("places highlights correctly around inline nodes and across paragraphs", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Mara"), schema.node("hardBreak"), schema.text("Jonas left")]),
      schema.node("paragraph", null, [schema.text("Jonas Quill")]),
    ])
    const found = findMentionDecorations(doc, matcher)
      .find()
      .sort((a, b) => a.from - b.from)
      .map((decoration) => [decoration.from, decoration.to, doc.textBetween(decoration.from, decoration.to)])
    expect(found).toEqual([
      [1, 5, "Mara"],
      [6, 11, "Jonas"],
      [18, 29, "Jonas Quill"],
    ])
  })
})

describe("mention highlight plugin with the composition guard", () => {
  it("keeps highlights on their characters while typing, and recomputes on refresh", () => {
    let state = stateWith("Mara met Jonas", true)
    expect(highlights(state)).toEqual(["Mara", "Jonas"])

    state = typeAtEnd(state, " Quill")
    expect(highlights(state)).toEqual(["Mara", "Jonas"])
    expect(pluginState(state).stale).toBe(true)

    state = refresh(state)
    expect(highlights(state)).toEqual(["Mara", "Jonas Quill"])
    expect(pluginState(state).stale).toBe(false)
  })

  it("moves highlights with text inserted before them", () => {
    let state = stateWith("Mara met Jonas", true)
    state = state.apply(state.tr.insertText("Then ", 1))
    expect(highlights(state)).toEqual(["Mara", "Jonas"])
  })

  it("shrinks a partly deleted highlight until the refresh drops it", () => {
    let state = stateWith("Mara met Jonas", true)
    state = state.apply(state.tr.delete(3, 5))
    expect(state.doc.textContent).toBe("Ma met Jonas")
    expect(highlights(state)).toEqual(["Ma", "Jonas"])

    state = refresh(state)
    expect(highlights(state)).toEqual(["Jonas"])
  })

  it("waits for a refresh before using a new matcher", () => {
    let state = stateWith("Mara met Jonas", true)
    const onlyJonas = buildMentionMatcher([{ id: "jonas", name: "Jonas", aliases: [] }])
    state = state.apply(state.tr.setMeta(mentionHighlightKey, { matcher: onlyJonas }))
    expect(highlights(state)).toEqual(["Mara", "Jonas"])
    expect(pluginState(state).stale).toBe(true)

    state = refresh(state)
    expect(highlights(state)).toEqual(["Jonas"])
  })

  it("ignores transactions that change neither the doc nor the matcher", () => {
    const state = stateWith("Mara met Jonas", true)
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    expect(pluginState(next)).toBe(pluginState(state))
  })
})

describe("mention highlight plugin without the guard", () => {
  it("recomputes on every edit", () => {
    let state = stateWith("Mara met Jonas", false)
    state = typeAtEnd(state, " Quill")
    expect(highlights(state)).toEqual(["Mara", "Jonas Quill"])
    expect(pluginState(state).stale).toBe(false)
  })
})
