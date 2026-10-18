import { Schema, Slice } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"
import { AI_MARK } from "@/yjs/prose"
import { AI_INSERT_META, aiTextPlugin, insertedRanges, withoutMark } from "./AiText"

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
  },
  marks: {
    [AI_MARK]: {
      attrs: { card: { default: null }, model: { default: null } },
      toDOM: () => ["span", 0],
      parseDOM: [{ tag: "span" }],
    },
    bold: {
      toDOM: () => ["strong", 0],
      parseDOM: [{ tag: "strong" }],
    },
  },
})

const ai = schema.marks[AI_MARK]
const bold = schema.marks.bold
const markedDoc = () =>
  schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("AI text", [ai.create({ card: "c", model: "m" })])]),
  ])

const markNames = (state: EditorState) => {
  const names: string[][] = []
  state.doc.descendants((node) => {
    if (node.isText) names.push(node.marks.map((mark) => mark.type.name))
  })
  return names
}

describe("AI text mark", () => {
  it("strips the AI mark from text the writer types inside AI text", () => {
    const state = EditorState.create({ doc: markedDoc(), plugins: [aiTextPlugin(ai, 0)] })
    const next = state.apply(state.tr.insertText("own ", 4))
    expect(markNames(next)).toEqual([[AI_MARK], [], [AI_MARK]])
  })

  it("keeps AI marks for AI insert transactions", () => {
    const state = EditorState.create({ doc: markedDoc(), plugins: [aiTextPlugin(ai, 0)] })
    const tr = state.tr.insertText("more ", 4).setMeta(AI_INSERT_META, true)
    const next = state.apply(tr)
    expect(markNames(next)).toEqual([[AI_MARK]])
    expect(insertedRanges(tr)).toEqual([{ from: 4, to: 9 }])
  })

  it("removes the AI mark from plain pasted slices only", () => {
    const slice = new Slice(
      schema.node("paragraph", null, [schema.text("paste", [ai.create(), bold.create()])]).content,
      0,
      0,
    )
    const stripped = withoutMark(slice, ai)
    expect(stripped.content.child(0).marks.map((mark) => mark.type.name)).toEqual(["bold"])
  })
})
