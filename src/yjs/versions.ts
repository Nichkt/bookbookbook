import * as Y from "yjs"
import { PROSE_FIELD } from "./prose"

/*
 * Version snapshots (DESIGN.md §8, §12) hold a scene's prose as it stood, not its edit history: a fresh doc with
 * the content copied in. Restoring copies the content back into the live doc as one ordinary edit, so it syncs and
 * stores like typing does.
 */

type ProseNode = Y.XmlElement | Y.XmlText

const copyNodes = (doc: Y.Doc): ProseNode[] =>
  doc
    .getXmlFragment(PROSE_FIELD)
    .toArray()
    .filter((node): node is ProseNode => !(node instanceof Y.XmlHook))
    .map((node) => node.clone())

/** The prose of `doc`, encoded as the state of a fresh doc. */
export function contentState(doc: Y.Doc): Uint8Array {
  const copy = new Y.Doc()
  copy.getXmlFragment(PROSE_FIELD).insert(0, copyNodes(doc))
  const state = Y.encodeStateAsUpdateV2(copy)
  copy.destroy()
  return state
}

/** A doc to read a stored state from. Destroy it when done. */
export function docFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc()
  Y.applyUpdateV2(doc, state)
  return doc
}

/** Whether two docs hold the same prose, formatting included. */
export const sameContent = (a: Y.Doc, b: Y.Doc) =>
  a.getXmlFragment(PROSE_FIELD).toString() === b.getXmlFragment(PROSE_FIELD).toString()

export const isEmptyContent = (doc: Y.Doc) =>
  doc
    .getXmlFragment(PROSE_FIELD)
    .toArray()
    .every((node) => node instanceof Y.XmlElement && node.nodeName === "paragraph" && node.length === 0)

/** Replaces the prose of `target` with a copy of `source`'s, as one transaction with `origin`. */
export function replaceContent(target: Y.Doc, source: Y.Doc, origin: unknown) {
  const nodes = copyNodes(source)
  target.transact(() => {
    const fragment = target.getXmlFragment(PROSE_FIELD)
    fragment.delete(0, fragment.length)
    // An empty fragment isn't a valid ProseMirror doc, which needs at least one block.
    fragment.insert(0, nodes.length > 0 ? nodes : [new Y.XmlElement("paragraph")])
  }, origin)
}
