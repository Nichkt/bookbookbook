import * as Y from "yjs"
import { PROSE_FIELD } from "@/yjs/prose"

/*
 * Scene prose as plain data, for export (DESIGN.md §13): a small tree in the shape of the editor's schema, read
 * from a scene's Y.Doc. Restoring a backup from its Markdown goes the other way. Marks other than these four (AI
 * tint, later comments) are left behind: exports never carry them.
 */

export type MarkName = "bold" | "italic" | "underline" | "strike"

/** Every mark, in the order a run's marks are listed. */
export const MARKS: readonly MarkName[] = ["bold", "italic", "underline", "strike"]

export type Inline = { type: "text"; text: string; marks: MarkName[] } | { type: "lineBreak" }

export type Block =
  | { type: "paragraph"; inlines: Inline[]; center?: boolean }
  | { type: "heading"; level: 2 | 3; inlines: Inline[]; center?: boolean }
  | { type: "break" }
  | { type: "quote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }

export const SCENE_BREAK: Block = { type: "break" }

type ProseNode = Y.XmlElement | Y.XmlText | Y.XmlHook

/** The prose of a scene doc as blocks. */
export function docBlocks(doc: Y.Doc): Block[] {
  return readBlocks(doc.getXmlFragment(PROSE_FIELD).toArray())
}

const isInlineNode = (node: ProseNode) =>
  node instanceof Y.XmlText || (node instanceof Y.XmlElement && node.nodeName === "hardBreak")

function readBlocks(nodes: ProseNode[]): Block[] {
  const blocks: Block[] = []
  for (const node of nodes) {
    if (node instanceof Y.XmlText) {
      blocks.push({ type: "paragraph", inlines: readText(node) })
      continue
    }
    if (!(node instanceof Y.XmlElement)) continue
    const center = node.getAttribute("textAlign") === "center" ? { center: true } : {}
    switch (node.nodeName) {
      case "paragraph":
        blocks.push({ type: "paragraph", inlines: readInlines(node), ...center })
        break
      case "heading": {
        const level = Number(node.getAttribute("level")) === 3 ? 3 : 2
        blocks.push({ type: "heading", level, inlines: readInlines(node), ...center })
        break
      }
      case "horizontalRule":
        blocks.push(SCENE_BREAK)
        break
      case "blockquote":
        blocks.push({ type: "quote", blocks: readBlocks(node.toArray()) })
        break
      case "bulletList":
      case "orderedList": {
        const start = Number(node.getAttribute("start") ?? 1)
        blocks.push({
          type: "list",
          ordered: node.nodeName === "orderedList",
          start: Number.isInteger(start) ? start : 1,
          items: node
            .toArray()
            .filter((item): item is Y.XmlElement => item instanceof Y.XmlElement)
            .map((item) => readBlocks(item.toArray())),
        })
        break
      }
      default: {
        // A node this version doesn't know: keep its words.
        const children = node.toArray()
        if (children.every(isInlineNode)) blocks.push({ type: "paragraph", inlines: readInlines(node) })
        else blocks.push(...readBlocks(children))
      }
    }
  }
  return blocks
}

function readInlines(element: Y.XmlElement): Inline[] {
  return element.toArray().flatMap((child): Inline[] => {
    if (child instanceof Y.XmlText) return readText(child)
    if (!(child instanceof Y.XmlElement)) return []
    return child.nodeName === "hardBreak" ? [{ type: "lineBreak" }] : readInlines(child)
  })
}

function readText(text: Y.XmlText): Inline[] {
  const delta = text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]
  return delta.flatMap((op): Inline[] =>
    typeof op.insert === "string" && op.insert ? [{ type: "text", text: op.insert, marks: marksOf(op.attributes) }] : [],
  )
}

function marksOf(attributes: Record<string, unknown> | undefined): MarkName[] {
  if (!attributes) return []
  // y-prosemirror names a mark that may overlap itself `name--hash`.
  const names = new Set(
    Object.entries(attributes)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key]) => key.split("--")[0]),
  )
  return MARKS.filter((mark) => names.has(mark))
}

/** Plain text of inline content: line breaks become newlines. */
export const inlineText = (inlines: readonly Inline[]) =>
  inlines.map((inline) => (inline.type === "text" ? inline.text : "\n")).join("")

/** Every word of the blocks, one block per line. */
export function blocksText(blocks: readonly Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
          return inlineText(block.inlines)
        case "break":
          return ""
        case "quote":
          return blocksText(block.blocks)
        case "list":
          return block.items.map(blocksText).join("\n")
      }
    })
    .join("\n")
}

const hasWords = (inlines: readonly Inline[]) => /\S/.test(inlineText(inlines))

/**
 * The blocks without empty paragraphs (or the quotes and list items they leave empty), and without scene breaks at
 * either end or doubled up: what an exported page should show.
 */
export function tidyBlocks(blocks: readonly Block[]): Block[] {
  const kept: Block[] = []
  for (const block of blocks) {
    let next: Block | null = block
    if (block.type === "paragraph" || block.type === "heading") next = hasWords(block.inlines) ? block : null
    else if (block.type === "quote") {
      const inner = tidyBlocks(block.blocks)
      next = inner.length > 0 ? { ...block, blocks: inner } : null
    } else if (block.type === "list") {
      const items = block.items.map(tidyBlocks).filter((item) => item.length > 0)
      next = items.length > 0 ? { ...block, items } : null
    } else if (kept.length === 0 || kept.at(-1)!.type === "break") next = null
    if (next) kept.push(next)
  }
  while (kept.at(-1)?.type === "break") kept.pop()
  return kept
}

/** The blocks as the state of a fresh scene doc, in the shape the editor reads. */
export function blocksState(blocks: readonly Block[]): Uint8Array {
  const doc = new Y.Doc()
  doc.transact(() => {
    const fragment = doc.getXmlFragment(PROSE_FIELD)
    writeBlocks(fragment, blocks)
    // The editor needs at least one block.
    if (fragment.length === 0) append(fragment, "paragraph")
  })
  const state = Y.encodeStateAsUpdateV2(doc)
  doc.destroy()
  return state
}

type Attributes = Record<string, string | number>

function append(parent: Y.XmlFragment, name: string, attributes: Attributes = {}): Y.XmlElement {
  const element = new Y.XmlElement(name)
  parent.insert(parent.length, [element])
  // y-prosemirror stores attributes with their own types, where Yjs's typings expect strings.
  const typed = element as Y.XmlElement<Attributes>
  for (const [key, value] of Object.entries(attributes)) typed.setAttribute(key, value)
  return element
}

function writeBlocks(parent: Y.XmlFragment, blocks: readonly Block[]) {
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
      case "heading": {
        const attributes: Attributes = block.type === "heading" ? { level: block.level } : {}
        if (block.center) attributes.textAlign = "center"
        writeInlines(append(parent, block.type, attributes), block.inlines)
        break
      }
      case "break":
        append(parent, "horizontalRule")
        break
      case "quote": {
        const quote = append(parent, "blockquote")
        writeBlocks(quote, block.blocks)
        if (quote.length === 0) append(quote, "paragraph")
        break
      }
      case "list": {
        if (block.items.length === 0) break
        const list = append(parent, block.ordered ? "orderedList" : "bulletList", block.ordered ? { start: block.start } : {})
        for (const item of block.items) {
          const listItem = append(list, "listItem")
          // A list item starts with a paragraph.
          if (item[0]?.type !== "paragraph") append(listItem, "paragraph")
          writeBlocks(listItem, item)
        }
        break
      }
    }
  }
}

function writeInlines(element: Y.XmlElement, inlines: readonly Inline[]) {
  let text: Y.XmlText | null = null
  for (const inline of inlines) {
    if (inline.type === "lineBreak") {
      append(element, "hardBreak")
      text = null
    } else if (inline.text) {
      if (!text) {
        text = new Y.XmlText()
        element.insert(element.length, [text])
      }
      // Explicit attributes, even none: without them Yjs carries on the formatting before the insert.
      text.insert(text.length, inline.text, Object.fromEntries(inline.marks.map((mark) => [mark, {}])))
    }
  }
}
