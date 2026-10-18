import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { SCENE_BREAK_TEXT } from "@/yjs/prose"

/*
 * The writer's text as the AI tools read it: paragraphs apart by a blank line, a line break as a newline, and a
 * scene break as "* * *". Positions map back into the doc, so a tool that replaces the selection can find it again.
 */

export const BLOCK_SEPARATOR = "\n\n"

export function leafText(node: ProseMirrorNode): string {
  if (node.type.name === "hardBreak") return "\n"
  return node.type.name === "horizontalRule" ? SCENE_BREAK_TEXT : ""
}

export const textBetween = (doc: ProseMirrorNode, from: number, to: number) =>
  doc.textBetween(from, to, BLOCK_SEPARATOR, leafText)

export interface FlatText {
  text: string
  /** The doc position of each character, from which textBetween reads it (see flatText). */
  at: number[]
}

/** The whole doc's text as textBetween gives it, with each character's position. */
export function flatText(doc: ProseMirrorNode): FlatText {
  let text = ""
  const at: number[] = []
  let first = true
  let lastEnd = 0
  doc.descendants((node, pos) => {
    const value = node.isText ? (node.text ?? "") : node.isLeaf ? leafText(node) : ""
    // As textBetween puts a separator before each block.
    if (node.isBlock && ((node.isLeaf && value) || node.isTextblock)) {
      if (first) first = false
      else {
        text += BLOCK_SEPARATOR
        // Its two characters: text from the end of the last block takes it in, as does text to this block's start.
        at.push(lastEnd, (node.isLeaf ? pos : pos + 1) - 1)
      }
      lastEnd = node.isLeaf ? pos + 1 : pos + node.nodeSize - 1
    }
    for (let i = 0; i < value.length; i++) at.push(node.isText ? pos + i : pos)
    text += value
    return true
  })
  return { text, at }
}

export interface TextRange {
  from: number
  to: number
}

/**
 * Where `wanted` is now: at `from`..`to` if it's still there, else its nearest copy, else null (it was changed or
 * deleted since).
 */
export function locate(doc: ProseMirrorNode, wanted: string, from: number, to: number): TextRange | null {
  if (!wanted) return null
  const size = doc.content.size
  if (from >= 0 && to <= size && from < to && textBetween(doc, from, to) === wanted) return { from, to }
  const flat = flatText(doc)
  let best: TextRange | null = null
  for (let index = flat.text.indexOf(wanted); index >= 0; index = flat.text.indexOf(wanted, index + 1)) {
    const start = flat.at[index]
    const end = flat.at[index + wanted.length - 1] + 1
    if (textBetween(doc, start, end) !== wanted) continue
    if (!best || Math.abs(start - from) < Math.abs(best.from - from)) best = { from: start, to: end }
  }
  return best
}
