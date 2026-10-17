import type { Inline } from "@/export/blocks"
import { BREAK_PIECE, isSceneBreakText, paragraphPiece, type Piece } from "./pieces"

/*
 * Plain text for import (DESIGN.md §13), from anywhere: UTF-8 or UTF-16 with a byte order mark, UTF-8 without, or
 * else Windows' Western encoding. Paragraphs are either a line each, as text copied out of a word processor has
 * them, or parted by blank lines. Lines inside a paragraph parted that way are line breaks, unless they're wrapped
 * short, as an e-text's are: then they join with spaces.
 */

/** Windows' Western characters for bytes 80–9F, which some decoders read as Latin-1's control codes instead. */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
]

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252")
      .decode(bytes)
      .replace(/[\u0080-\u009f]/g, (char) => String.fromCharCode(WINDOWS_1252_HIGH[char.charCodeAt(0) - 0x80]))
  }
}

/** How a text's paragraphs are told apart: a line each, or blank lines between them. */
export type Paragraphing = "lines" | "blank-lines"

/** The text's lines, trimmed: a form feed (an old page break) as a blank line, and other control characters gone. */
const linesOf = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(/[^\P{Cc}\n\t]/gu, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())

/** Whether the lines are wrapped short, as an e-text's are: almost none long, and most inside a paragraph near full. */
function hardWrapped(lines: readonly string[]): boolean {
  let filled = 0
  let long = 0
  let inner = 0
  let full = 0
  lines.forEach((line, index) => {
    if (!line) return
    filled++
    if (line.length > 80) long++
    if (lines[index + 1]) {
      inner++
      if (line.length >= 50) full++
    }
  })
  return inner >= 3 && long <= filled * 0.05 && full >= inner * 0.75
}

/** A guess at how the text parts its paragraphs, from the lines next to each other and those with space between. */
export function guessParagraphing(text: string): Paragraphing {
  const lines = linesOf(text)
  let joined = 0
  let parted = 0
  let previous = -1
  lines.forEach((line, index) => {
    if (!line) return
    if (previous >= 0) {
      if (index === previous + 1) joined++
      else parted++
    }
    previous = index
  })
  if (parted === 0) return "lines"
  if (joined === 0 || hardWrapped(lines)) return "blank-lines"
  return parted >= joined ? "blank-lines" : "lines"
}

export function readPlainText(text: string, paragraphing: Paragraphing): Piece[] {
  const lines = linesOf(text)
  const wrapped = paragraphing === "blank-lines" && hardWrapped(lines)
  const pieces: Piece[] = []
  let paragraph: string[] = []
  const flush = () => {
    const inlines: Inline[] = []
    paragraph.forEach((line, index) => {
      if (index > 0) inlines.push(wrapped ? { type: "text", text: " ", marks: [] } : { type: "lineBreak" })
      inlines.push({ type: "text", text: line, marks: [] })
    })
    const piece = paragraphPiece(inlines)
    if (piece) pieces.push(piece)
    paragraph = []
  }
  for (const line of lines) {
    if (!line) flush()
    else if (isSceneBreakText(line)) {
      flush()
      pieces.push(BREAK_PIECE)
    } else {
      paragraph.push(line)
      if (paragraphing === "lines") flush()
    }
  }
  flush()
  return pieces
}
