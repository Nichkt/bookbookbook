import * as Y from "yjs"
import { describe, expect, it } from "vitest"
import { PROSE_FIELD, proseState, proseText } from "./prose"

const docFrom = (state: Uint8Array) => {
  const doc = new Y.Doc()
  Y.applyUpdateV2(doc, state)
  return doc
}

describe("proseState / proseText", () => {
  it("round-trips paragraphs, including empty ones", () => {
    const paragraphs = ["The ferry nosed through the harbor.", "", "Jonas waited below the crane."]
    expect(proseText(docFrom(proseState(paragraphs)))).toBe(paragraphs.join("\n"))
  })

  it("builds the shape TipTap's Collaboration extension reads", () => {
    const fragment = docFrom(proseState(["One", "Two"])).getXmlFragment(PROSE_FIELD)
    expect(fragment.length).toBe(2)
    expect(fragment.toArray().map((node) => (node as Y.XmlElement).nodeName)).toEqual(["paragraph", "paragraph"])
  })

  it("turns hard breaks and nested blocks into line breaks, so words never merge", () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment(PROSE_FIELD)
    const paragraph = new Y.XmlElement("paragraph")
    const quote = new Y.XmlElement("blockquote")
    const first = new Y.XmlElement("paragraph")
    const second = new Y.XmlElement("paragraph")
    fragment.insert(0, [paragraph, quote])
    paragraph.insert(0, [new Y.XmlText("end of line."), new Y.XmlElement("hardBreak"), new Y.XmlText("Next")])
    quote.insert(0, [first, second])
    first.insert(0, [new Y.XmlText("Quoted.")])
    second.insert(0, [new Y.XmlText("Again.")])
    expect(proseText(doc)).toBe("end of line.\nNext\nQuoted.\nAgain.")
  })

  it("keeps formatted runs together", () => {
    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement("paragraph")
    doc.getXmlFragment(PROSE_FIELD).insert(0, [paragraph])
    const text = new Y.XmlText()
    paragraph.insert(0, [text])
    text.insert(0, "She was ")
    text.insert(8, "never", { italic: true })
    text.insert(13, " late.")
    expect(proseText(doc)).toBe("She was never late.")
  })
})
