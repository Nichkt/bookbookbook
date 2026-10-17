import { inlineText, SCENE_BREAK, type Block, type Inline, type MarkName } from "@/export/blocks"

/*
 * A manuscript as read for import (DESIGN.md §13): its prose as blocks, with its headings kept apart at the level
 * they were written at, for the splitter to cut chapters and scenes at.
 */

/** A heading as written: level 0 is a Word document's Title, 1 its biggest heading. */
export interface HeadingPiece {
  type: "heading"
  level: number
  inlines: Inline[]
  center?: boolean
}

export type Piece = HeadingPiece | { type: "block"; block: Block }

export const BREAK_PIECE: Piece = { type: "block", block: SCENE_BREAK }

/** A manuscript read from a file or a paste. */
export interface ReadManuscript {
  pieces: Piece[]
  /** From the file's own details, when it has them: "" when not. */
  title: string
  author: string
}

/** Symbols a scene break is made of: "* * *", "#", "~", "◆", "⁂" and the like. */
const BREAK_TEXT = /^[\s*#~•·◆◇♦⁂§_=+\-–—―⸺⸻❧❦✦✧❖●○◊※†‡]+$/u

/** Whether a paragraph's text is a scene break rather than words. */
export const isSceneBreakText = (text: string) => text.length <= 20 && /\S/.test(text) && BREAK_TEXT.test(text)

const sameMarks = (a: readonly MarkName[], b: readonly MarkName[]) =>
  a.length === b.length && a.every((mark, index) => mark === b[index])

/** The runs with neighbours of the same marks joined, and without space or line breaks at either end. */
export function tidyInlines(inlines: readonly Inline[]): Inline[] {
  const runs: Inline[] = []
  for (const inline of inlines) {
    const last = runs.at(-1)
    if (inline.type === "text") {
      if (!inline.text) continue
      if (last?.type === "text" && sameMarks(last.marks, inline.marks)) {
        runs[runs.length - 1] = { ...last, text: last.text + inline.text }
        continue
      }
    }
    runs.push(inline)
  }
  let start = 0
  while (start < runs.length) {
    const first = runs[start]
    const text = first.type === "text" ? first.text.replace(/^\s+/u, "") : ""
    if (!text) {
      start++
      continue
    }
    runs[start] = { ...first, text } as Inline
    break
  }
  let end = runs.length
  while (end > start) {
    const last = runs[end - 1]
    const text = last.type === "text" ? last.text.replace(/\s+$/u, "") : ""
    if (!text) {
      end--
      continue
    }
    runs[end - 1] = { ...last, text } as Inline
    break
  }
  return runs.slice(start, end)
}

/** A paragraph's piece: a scene break if that's all it holds, nothing if it's empty. */
export function paragraphPiece(inlines: readonly Inline[], center = false): Piece | null {
  const tidy = tidyInlines(inlines)
  const text = inlineText(tidy)
  if (!/\S/.test(text)) return null
  if (isSceneBreakText(text)) return BREAK_PIECE
  return { type: "block", block: { type: "paragraph", inlines: tidy, ...(center ? { center: true } : {}) } }
}

/** A heading's piece, or a scene break for a heading of symbols. Nothing if it's empty. */
export function headingPiece(level: number, inlines: readonly Inline[], center = false): Piece | null {
  const tidy = tidyInlines(inlines)
  const text = inlineText(tidy)
  if (!/\S/.test(text)) return null
  if (isSceneBreakText(text)) return BREAK_PIECE
  return { type: "heading", level, inlines: tidy, ...(center ? { center: true } : {}) }
}

/** A heading's text, a line per line it was set on, each trimmed, with runs of space made one. */
export const headingLines = (inlines: readonly Inline[]) =>
  inlineText(inlines)
    .split("\n")
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)

export const plainText = (value: string): Inline[] => (value ? [{ type: "text", text: value, marks: [] }] : [])
