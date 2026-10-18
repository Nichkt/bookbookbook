import { getSchema } from "@tiptap/core"
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { leafText } from "@/ai/docText"
import { announce } from "@/app/feedback"
import type { Step } from "@/speech/commands"
import { dictationTransaction, proseTarget } from "./proseDictation"

vi.mock("@/app/feedback", () => ({ announce: vi.fn() }))

const schema = getSchema([
  StarterKit.configure({ undoRedo: false, code: false, codeBlock: false, link: false, trailingNode: false }),
])

const words = (text: string): Step => ({ kind: "words", text })
const COMMA: Step = { kind: "mark", mark: "," }
const PARAGRAPH: Step = { kind: "break", paragraph: true }
const LINE: Step = { kind: "break", paragraph: false }
const SCRATCH: Step = { kind: "scratch" }

/** A doc of paragraphs, with the caret at "|", or the text between two selected. */
function stateOf(...paragraphs: string[]): EditorState {
  const carets: number[] = []
  let start = 0
  const nodes = paragraphs.map((source) => {
    const text = source.replaceAll("|", "")
    let offset = 0
    for (const part of source.split("|").slice(0, -1)) {
      offset += part.length
      carets.push(start + 1 + offset)
    }
    start += text.length + 2
    return schema.node("paragraph", null, text ? schema.text(text) : undefined)
  })
  const doc = schema.node("doc", null, nodes)
  const selection = carets.length ? TextSelection.create(doc, carets[0], carets.at(-1)) : undefined
  return EditorState.create({ doc, selection })
}

/** The doc's paragraphs as stateOf takes them, a line break as "\n". */
function show(state: EditorState): string[] {
  const { from, to } = state.selection
  const paragraphs: string[] = []
  state.doc.forEach((node, offset) => {
    let text = ""
    for (let index = 0; index <= node.content.size; index++) {
      const pos = offset + 1 + index
      if (pos === from || (pos === to && to !== from)) text += "|"
      if (index < node.content.size) text += node.textBetween(index, index + 1, undefined, leafText)
    }
    paragraphs.push(text)
  })
  return paragraphs
}

const typed = (state: EditorState, steps: Step[], atEnd = false) => {
  const dictated = dictationTransaction(state, steps, atEnd)
  return dictated && show(state.apply(dictated.tr))
}

describe("dictation into the text", () => {
  it("types at the caret, spaced and capitalized to follow on", () => {
    expect(typed(stateOf("Mara waited.|"), [words("the tide turned"), COMMA, words("slowly")])).toEqual([
      "Mara waited. The tide turned, slowly|",
    ])
    expect(typed(stateOf("|"), [words("hello")])).toEqual(["Hello|"])
    expect(typed(stateOf("Mara|"), [words(" ")])).toBeNull()
  })

  it("starts paragraphs and lines", () => {
    expect(typed(stateOf("Mara waited.|"), [PARAGRAPH, words("then she ran"), LINE, words("fast")])).toEqual([
      "Mara waited.",
      "Then she ran\nFast|",
    ])
    expect(typed(stateOf("Mara| waited."), [PARAGRAPH])).toEqual(["Mara", "| waited."])
  })

  it("puts a space between dictation and the words after it", () => {
    expect(typed(stateOf("|waited."), [words("mara")])).toEqual(["Mara| waited."])
    expect(typed(stateOf("Mara|."), [words("ran")])).toEqual(["Mara ran|."])
  })

  it("replaces the selection, or goes on from the end", () => {
    expect(typed(stateOf("Mara |ran| home."), [words("walked")])).toEqual(["Mara walked| home."])
    expect(typed(stateOf("|First.", "Second."), [words("third")], true)).toEqual(["First.", "Second. Third|"])
  })

  it("goes on in the bold or italic of the words before a break", () => {
    const italic = schema.marks.italic.create()
    const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text("Softly", [italic]))])
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) })
    const after = state.apply(dictationTransaction(state, [PARAGRAPH, words("still")])!.tr)
    expect(after.doc.child(1).child(0).marks.map((mark) => mark.type.name)).toEqual(["italic"])
  })
})

function fakeEditor(state: EditorState) {
  const editor = {
    state,
    isDestroyed: false,
    isEditable: true,
    view: {
      dispatch: (tr: Transaction) => {
        editor.state = editor.state.apply(tr)
      },
    },
  }
  return editor
}

describe("the Write screen's dictation target", () => {
  beforeEach(() => vi.mocked(announce).mockClear())

  it("takes back what was said last, piece by piece", () => {
    const editor = fakeEditor(stateOf("Mara waited.|"))
    const target = proseTarget(() => ({ editor, atEnd: false }))
    target.insert([words("the tide turned")])
    target.insert([PARAGRAPH, words("she ran")])
    expect(show(editor.state)).toEqual(["Mara waited. The tide turned", "She ran|"])
    target.insert([SCRATCH])
    expect(show(editor.state)).toEqual(["Mara waited. The tide turned|"])
    target.insert([SCRATCH, words("it rose")])
    expect(show(editor.state)).toEqual(["Mara waited. It rose|"])
    target.forget()
    target.insert([SCRATCH])
    expect(show(editor.state)).toEqual(["Mara waited. It rose|"])
  })

  it("leaves what was said once the text has changed since", () => {
    const editor = fakeEditor(stateOf("Mara|"))
    const target = proseTarget(() => ({ editor, atEnd: false }))
    target.insert([words("ran")])
    editor.view.dispatch(editor.state.tr.insertText("!"))
    target.insert([SCRATCH])
    expect(show(editor.state)).toEqual(["Mara ran!|"])
    expect(announce).toHaveBeenCalledWith("Couldn't scratch that: the text has changed since.")
  })

  it("isn't there without an editor", () => {
    expect(proseTarget(() => null).alive?.()).toBe(false)
  })
})
