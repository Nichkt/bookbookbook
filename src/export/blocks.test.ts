import * as Y from "yjs"
import { describe, expect, it } from "vitest"
import { br, heading, list, para, quote, sceneBreak, text } from "@/test/blocks"
import { PROSE_FIELD, proseState } from "@/yjs/prose"
import { docFromState } from "@/yjs/versions"
import { blocksState, blocksText, docBlocks, tidyBlocks, type Block } from "./blocks"

function readBack(state: Uint8Array): Block[] {
  const doc = docFromState(state)
  try {
    return docBlocks(doc)
  } finally {
    doc.destroy()
  }
}

describe("docBlocks and blocksState", () => {
  it("round-trip every kind of block", () => {
    const blocks: Block[] = [
      heading(2, text("One")),
      para(text("Plain, "), text("bold", "bold"), text(" and "), text("both", "bold", "italic"), text(".")),
      { type: "paragraph", inlines: [text("Centered")], center: true },
      para(text("Line one"), br, text("line two", "underline")),
      sceneBreak,
      heading(3, text("Smaller", "strike")),
      quote(para(text("Quoted")), para(text("Twice"))),
      list(false, [[para(text("a"))], [para(text("b")), list(true, [[para(text("c"))]], 3)]]),
    ]
    expect(readBack(blocksState(blocks))).toEqual(blocks)
  })

  it("read the plain paragraphs that proseState writes", () => {
    expect(readBack(proseState(["One", "", "Two"]))).toEqual([para(text("One")), para(), para(text("Two"))])
  })

  it("write at least one paragraph, and give a list item its first paragraph", () => {
    expect(readBack(blocksState([]))).toEqual([para()])
    expect(readBack(blocksState([list(false, [[list(false, [[para(text("x"))]])]])]))).toEqual([
      list(false, [[para(), list(false, [[para(text("x"))]])]]),
    ])
  })

  it("read marks under y-prosemirror's overlapping names, and leave other marks behind", () => {
    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement("paragraph")
    doc.getXmlFragment(PROSE_FIELD).insert(0, [paragraph])
    const run = new Y.XmlText()
    paragraph.insert(0, [run])
    run.insert(0, "tinted", { aiTint: {}, "italic--a1b2": {} })
    run.insert(6, " plain", {})
    expect(docBlocks(doc)).toEqual([para(text("tinted", "italic"), text(" plain"))])
    doc.destroy()
  })

  it("keep the words of nodes they don't know", () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment(PROSE_FIELD)
    const aside = new Y.XmlElement("aside")
    const figure = new Y.XmlElement("figure")
    fragment.insert(0, [aside, figure])
    aside.insert(0, [new Y.XmlText("Inline words")])
    const inner = new Y.XmlElement("paragraph")
    figure.insert(0, [inner])
    inner.insert(0, [new Y.XmlText("Block words")])
    expect(docBlocks(doc)).toEqual([para(text("Inline words")), para(text("Block words"))])
    doc.destroy()
  })
})

describe("tidyBlocks", () => {
  it("drops empty blocks and stray scene breaks", () => {
    expect(
      tidyBlocks([
        sceneBreak,
        para(),
        para(text("  ")),
        para(text("One")),
        sceneBreak,
        sceneBreak,
        quote(para()),
        para(text("Two")),
        list(false, [[para()], [para(text("item"))]]),
        heading(2),
        sceneBreak,
      ]),
    ).toEqual([para(text("One")), sceneBreak, para(text("Two")), list(false, [[para(text("item"))]])])
  })
})

describe("blocksText", () => {
  it("puts each block on its own line", () => {
    expect(blocksText([para(text("One"), br, text("two")), sceneBreak, list(false, [[para(text("a"))], [para(text("b"))]])])).toBe(
      "One\ntwo\n\na\nb",
    )
  })
})
