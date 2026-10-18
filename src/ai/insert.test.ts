import { getSchema } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import { AiText } from "@/editor/extensions/AiText"
import { AI_MARK } from "@/yjs/prose"
import { aiSlice, inlineRuns, proseBlocks, spaceAfter, spaceBefore, surroundings } from "./insert"

const schema = getSchema([
  StarterKit.configure({ undoRedo: false, code: false, codeBlock: false, link: false, trailingNode: false }),
  AiText,
])

describe("AI prose insertion helpers", () => {
  it("turns prose into paragraphs, scene breaks and inline runs", () => {
    expect(proseBlocks("\nFirst\n\n* * *\n\nSecond\n***\n")).toEqual([
      { kind: "paragraph", text: "First" },
      { kind: "break" },
      { kind: "paragraph", text: "Second" },
    ])
    expect(inlineRuns("A ***bold it*** and **bold** and _it_.")).toEqual([
      { text: "A ", bold: false, italic: false },
      { text: "bold it", bold: true, italic: true },
      { text: " and ", bold: false, italic: false },
      { text: "bold", bold: true, italic: false },
      { text: " and ", bold: false, italic: false },
      { text: "it", bold: false, italic: true },
      { text: ".", bold: false, italic: false },
    ])
  })

  it("knows when to add spaces around inserted prose", () => {
    expect(spaceBefore("Mara", "ran")).toBe(true)
    expect(spaceBefore("Mara ", "ran")).toBe(false)
    expect(spaceBefore("Mara", ", said")).toBe(false)
    expect(spaceAfter("ran", "home")).toBe(true)
    expect(spaceAfter("ran ", "home")).toBe(false)
    expect(spaceAfter("ran", ".")).toBe(false)
  })

  it("builds AI-marked slices with surrounding spaces", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text("Mara waited"))])
    const around = surroundings(doc, { from: 5, to: 5 })
    expect(around).toEqual({ before: "Mara", after: " waited", inTextblock: true })
    const built = aiSlice(schema, "ran\n\n---\n\n**fast**", { card: "card", model: "model" }, around)
    expect(built?.slice.content.childCount).toBe(3)
    const first = built!.slice.content.child(0)
    expect(first.textBetween(0, first.content.size)).toBe(" ran")
    expect(first.child(1).marks.map((mark) => mark.type.name)).toContain(AI_MARK)
    const last = built!.slice.content.child(2)
    expect(last.child(0).marks.map((mark) => mark.type.name).sort()).toEqual([AI_MARK, "bold"])
  })
})
