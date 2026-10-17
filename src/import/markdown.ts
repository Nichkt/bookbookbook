import { inlineText, type Block } from "@/export/blocks"
import { markdownFrontMatter, markdownToBlocks } from "@/export/markdown"
import { BREAK_PIECE, headingPiece, isSceneBreakText, type Piece, type ReadManuscript } from "./pieces"

/*
 * Markdown for import (DESIGN.md §13), read as export writes it and as most people do: the headings at the top
 * level keep the level they were written at, for the splitter; everything else is the editor's blocks. Front
 * matter can give the title and author.
 */

/** A plain value of front matter, unquoted: "" when it's missing, a list, or anything fancier. */
function frontMatterValue(yaml: string, key: string): string {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "mi").exec(yaml)
  let value = match?.[1].trim() ?? ""
  if (/^".*"$/.test(value)) {
    try {
      value = String(JSON.parse(value))
    } catch {
      value = value.slice(1, -1)
    }
  } else if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'")
  return /^[[{|>]/.test(value) ? "" : value.trim()
}

export function readMarkdown(markdown: string): ReadManuscript {
  const levels = new Map<Block, number>()
  const pieces: Piece[] = []
  for (const block of markdownToBlocks(markdown, levels)) {
    const level = levels.get(block)
    if (level !== undefined && block.type === "heading") {
      const piece = headingPiece(level, block.inlines, block.center)
      if (piece) pieces.push(piece)
    } else if (block.type === "paragraph" && isSceneBreakText(inlineText(block.inlines))) {
      pieces.push(BREAK_PIECE)
    } else pieces.push({ type: "block", block })
  }
  const yaml = markdownFrontMatter(markdown)
  return { pieces, title: frontMatterValue(yaml, "title"), author: frontMatterValue(yaml, "author") }
}
