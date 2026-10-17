import { describe, expect, test } from "vitest"
import * as Y from "yjs"
import { PROSE_FIELD, proseText } from "./prose"
import { contentState, docFromState, isEmptyContent, replaceContent, sameContent } from "./versions"

/** A doc shaped the way TipTap stores prose: formatted text, attributes of several types, a scene break. */
function richDoc(words = "The tide came in.") {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(PROSE_FIELD)
  const heading = new Y.XmlElement<{ level: number }>("heading")
  heading.setAttribute("level", 2)
  heading.insert(0, [new Y.XmlText("Morning")])
  const centered = new Y.XmlElement("paragraph")
  centered.setAttribute("textAlign", "center")
  const text = new Y.XmlText()
  centered.insert(0, [text])
  const plain = new Y.XmlElement("paragraph")
  plain.insert(0, [new Y.XmlText(words)])
  fragment.insert(0, [heading as unknown as Y.XmlElement, centered, new Y.XmlElement("horizontalRule"), plain])
  text.insert(0, "She said ")
  text.insert(9, "nothing", { italic: {} })
  return doc
}

describe("contentState", () => {
  test("round-trips the prose with formatting and attributes", () => {
    const doc = richDoc()
    const copy = docFromState(contentState(doc))
    expect(sameContent(copy, doc)).toBe(true)
    expect(proseText(copy)).toBe("Morning\nShe said nothing\n\nThe tide came in.")
    const heading = copy.getXmlFragment(PROSE_FIELD).get(0) as Y.XmlElement
    expect(heading.getAttribute("level")).toBe(2)
    const italic = (copy.getXmlFragment(PROSE_FIELD).get(1) as Y.XmlElement).get(0) as Y.XmlText
    expect(italic.toDelta()).toEqual([{ insert: "She said " }, { insert: "nothing", attributes: { italic: {} } }])
  })

  test("leaves the edit history behind", () => {
    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement("paragraph")
    doc.getXmlFragment(PROSE_FIELD).insert(0, [paragraph])
    const text = new Y.XmlText()
    paragraph.insert(0, [text])
    for (let i = 0; i < 20; i++) {
      text.insert(0, "a draft sentence that gets cut ")
      text.delete(0, 31)
    }
    text.insert(0, "Kept.")
    expect(Y.decodeUpdateV2(Y.encodeStateAsUpdateV2(doc)).ds.clients.size).toBe(1)
    expect(Y.decodeUpdateV2(contentState(doc)).ds.clients.size).toBe(0)
    expect(proseText(docFromState(contentState(doc)))).toBe("Kept.")
  })
})

describe("sameContent", () => {
  test("sees text, formatting and attribute changes", () => {
    expect(sameContent(richDoc(), richDoc())).toBe(true)
    expect(sameContent(richDoc(), richDoc("The tide went out."))).toBe(false)

    const bolder = richDoc()
    ;((bolder.getXmlFragment(PROSE_FIELD).get(3) as Y.XmlElement).get(0) as Y.XmlText).format(0, 3, { bold: {} })
    expect(sameContent(bolder, richDoc())).toBe(false)

    const left = richDoc()
    ;(left.getXmlFragment(PROSE_FIELD).get(1) as Y.XmlElement).removeAttribute("textAlign")
    expect(sameContent(left, richDoc())).toBe(false)
  })
})

describe("replaceContent", () => {
  test("makes the target's prose a copy of the source's, as one edit that syncs", () => {
    const live = richDoc("Current words.")
    const replica = docFromState(Y.encodeStateAsUpdateV2(live))
    live.on("updateV2", (update: Uint8Array, origin: unknown) => {
      expect(origin).toBe("restore")
      Y.applyUpdateV2(replica, update)
    })
    const older = richDoc("Older words.")
    replaceContent(live, older, "restore")
    expect(sameContent(live, older)).toBe(true)
    expect(sameContent(replica, older)).toBe(true)
    // The source is untouched.
    expect(proseText(older)).toContain("Older words.")
  })

  test("an empty source leaves one empty paragraph", () => {
    const live = richDoc()
    replaceContent(live, new Y.Doc(), null)
    expect(live.getXmlFragment(PROSE_FIELD).toString()).toBe("<paragraph></paragraph>")
    expect(isEmptyContent(live)).toBe(true)
    expect(isEmptyContent(new Y.Doc())).toBe(true)
    expect(isEmptyContent(richDoc())).toBe(false)
  })
})
