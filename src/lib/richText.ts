/*
 * Codex notes are stored as a rich-text doc (ProseMirror JSON, DESIGN.md §5), so a richer notes editor can come later
 * without a migration. Until then they're edited as plain text, a paragraph per line.
 */

interface RichNode {
  type?: unknown
  text?: unknown
  content?: unknown
}

const isNode = (value: unknown): value is RichNode => typeof value === "object" && value !== null && !Array.isArray(value)

const children = (node: RichNode): RichNode[] => (Array.isArray(node.content) ? node.content.filter(isNode) : [])

function inlineText(node: RichNode): string {
  if (node.type === "text") return typeof node.text === "string" ? node.text : ""
  if (node.type === "hardBreak") return "\n"
  return children(node).map(inlineText).join("")
}

/** A block holding text runs, like a paragraph or heading, rather than other blocks. */
const holdsText = (node: RichNode) => children(node).some((child) => child.type === "text" || child.type === "hardBreak")

function blockLines(node: RichNode): string[] {
  if (node.type === "paragraph" || node.type === "heading" || holdsText(node)) return [inlineText(node)]
  const nested = children(node)
  return nested.length > 0 ? nested.flatMap(blockLines) : [""]
}

/** The doc's text, a line per paragraph. Text that isn't a doc reads as itself. */
export function richTextToPlain(stored: string | null | undefined): string {
  if (!stored) return ""
  let doc: unknown
  try {
    doc = JSON.parse(stored)
  } catch {
    return stored
  }
  if (!isNode(doc) || doc.type !== "doc") return stored
  const lines = children(doc).flatMap(blockLines)
  return lines.length === 1 && lines[0] === "" ? "" : lines.join("\n")
}

/** Plain text as a doc, a paragraph per line. */
export function plainToRichText(text: string): string {
  const content = text
    .split(/\r\n?|\n/)
    .map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }))
  return JSON.stringify({ type: "doc", content })
}
