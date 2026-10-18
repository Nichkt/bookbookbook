import * as Y from "yjs"
import { describe, expect, it } from "vitest"
import { AI_MARK, isAiAttribute, PROSE_FIELD, proseCounts, proseForReading, proseState, proseText } from "./prose"

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

  it("reads prose for AI with blank lines and scene breaks", () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment(PROSE_FIELD)
    const first = new Y.XmlElement("paragraph")
    const empty = new Y.XmlElement("paragraph")
    const rule = new Y.XmlElement("horizontalRule")
    const second = new Y.XmlElement("paragraph")
    fragment.insert(0, [first, empty, rule, second])
    first.insert(0, [new Y.XmlText("First paragraph.")])
    second.insert(0, [new Y.XmlText("Second paragraph.")])
    expect(proseForReading(doc)).toBe("First paragraph.\n\n* * *\n\nSecond paragraph.")
  })

  it("counts AI words when most of the word is AI marked", () => {
    expect(isAiAttribute(AI_MARK)).toBe(true)
    expect(isAiAttribute(`${AI_MARK}--abc`)).toBe(true)
    expect(isAiAttribute("bold")).toBe(false)

    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement("paragraph")
    const text = new Y.XmlText()
    doc.getXmlFragment(PROSE_FIELD).insert(0, [paragraph])
    paragraph.insert(0, [text])
    text.insert(0, "writer ")
    text.insert(7, "mostlyai", { [AI_MARK]: { card: "c" } })
    text.insert(15, " h", { [AI_MARK]: { card: "c" } })
    text.insert(17, "alfmine")
    expect(proseCounts(doc)).toEqual({ words: 3, aiWords: 2 })
  })
})
