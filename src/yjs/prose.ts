import * as Y from "yjs"

/** The Y.XmlFragment that TipTap's Collaboration extension binds to (`field` option). */
export const PROSE_FIELD = "prose"

/** Encodes paragraphs of plain text as a fresh scene doc, in the shape TipTap's Collaboration extension reads. */
export function proseState(paragraphs: string[]): Uint8Array {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(PROSE_FIELD)
  doc.transact(() => {
    paragraphs.forEach((text, index) => {
      const paragraph = new Y.XmlElement("paragraph")
      fragment.insert(index, [paragraph])
      if (text) paragraph.insert(0, [new Y.XmlText(text)])
    })
  })
  const state = Y.encodeStateAsUpdateV2(doc)
  doc.destroy()
  return state
}

/** Plain text of a scene doc: blocks and line breaks become newlines. */
export function proseText(doc: Y.Doc): string {
  return doc
    .getXmlFragment(PROSE_FIELD)
    .toArray()
    .map((node) => textOf(node))
    .join("\n")
}

function textOf(node: Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as { insert: unknown }[]).map((op) => (typeof op.insert === "string" ? op.insert : "")).join("")
  }
  if (!(node instanceof Y.XmlElement)) return ""
  if (node.nodeName === "hardBreak") return "\n"
  const children = node.toArray()
  // Text runs join directly; nested blocks (quotes, list items) go on their own lines.
  const holdsBlocks = children.some((child) => child instanceof Y.XmlElement && child.nodeName !== "hardBreak")
  return children.map(textOf).join(holdsBlocks ? "\n" : "")
}
