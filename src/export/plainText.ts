import { inlineText, type Block, type Inline } from "./blocks"

/*
 * Plain text for export (DESIGN.md §13): blocks apart by a blank line, a scene break as "* * *", quotes indented
 * and list items marked, so the page keeps its shape without any markup.
 */

export function blocksToText(blocks: readonly Block[]): string {
  return blocks
    .map(blockText)
    .filter((chunk) => chunk)
    .join("\n\n")
}

function blockText(block: Block): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return lines(block.inlines)
    case "break":
      return "* * *"
    case "quote":
      return blocksToText(block.blocks).replace(/^(?=.)/gm, "    ")
    case "list": {
      const loose = block.items.some((item) => item.length > 1)
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${Math.max(0, block.start) + index}.` : "•"
          const body = blocksToText(item)
          const pad = " ".repeat(marker.length + 1)
          return body ? `${marker} ${body.replace(/\n(?=.)/g, `\n${pad}`)}` : marker
        })
        .join(loose ? "\n\n" : "\n")
    }
  }
}

/** Inline content as lines, without trailing spaces or blank lines at either end. */
function lines(inlines: readonly Inline[]): string {
  return inlineText(inlines)
    .split(/\r\n?|\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
}
