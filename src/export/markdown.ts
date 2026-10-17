import { MARKS, SCENE_BREAK, type Block, type Inline, type MarkName } from "./blocks"

/*
 * Markdown for export (DESIGN.md §13): CommonMark, with GFM's ~~strike~~ and HTML's <u> for underline, which
 * Markdown lacks. markdownToBlocks reads it back, and most hand-written Markdown, so a backup can be restored from
 * its Markdown alone.
 */

export interface MarkdownOptions {
  /** Added to heading levels: 1 when the file's chapters are `##`, so a scene's own headings sit below them. */
  headingOffset?: number
}

/** The blocks as Markdown, without a trailing newline. */
export function blocksToMarkdown(blocks: readonly Block[], options: MarkdownOptions = {}): string {
  return renderBlocks(blocks, options.headingOffset ?? 0)
}

/** A heading of plain text. */
export function markdownHeading(level: number, text: string): string {
  const content = renderLine([{ text: text.replace(/\s+/g, " "), marks: [] }])
  // A trailing # would read as a closing sequence.
  return `${"#".repeat(Math.max(1, Math.min(6, level)))} ${content.replace(/#$/, "\\#")}`
}

// Rendering

interface Run {
  text: string
  marks: readonly MarkName[]
}

interface ListMarkers {
  ordered: boolean
  alternate: boolean
}

function renderBlocks(blocks: readonly Block[], offset: number): string {
  const chunks: string[] = []
  // Two lists in a row would run together as one: alternate their markers.
  let previousList: ListMarkers | null = null
  for (const block of blocks) {
    let list: ListMarkers | null = null
    let chunk: string
    if (block.type === "list") {
      list = { ordered: block.ordered, alternate: alternates(previousList, block.ordered) }
      chunk = renderList(block, offset, list.alternate)
    } else chunk = renderBlock(block, offset)
    if (!chunk) continue
    chunks.push(chunk)
    previousList = list
  }
  return chunks.join("\n\n")
}

/** Whether a list switches markers: it follows a list of the same kind that didn't. */
function alternates(previous: ListMarkers | null, ordered: boolean): boolean {
  return previous?.ordered === ordered && !previous.alternate
}

function renderBlock(block: Exclude<Block, { type: "list" }>, offset: number): string {
  switch (block.type) {
    case "paragraph":
      return renderParagraph(block.inlines)
    case "heading": {
      const runs = inlineLines(block.inlines).flatMap((line, index) => (index ? [{ text: " ", marks: [] }, ...line] : line))
      const content = renderLine(runs)
      return content && `${"#".repeat(Math.min(6, block.level + offset))} ${content.replace(/#$/, "\\#")}`
    }
    case "break":
      return "* * *"
    case "quote": {
      const inner = renderBlocks(block.blocks, offset)
      return inner && inner.replace(/^/gm, "> ").replace(/^> $/gm, ">")
    }
  }
}

function renderList(list: Extract<Block, { type: "list" }>, offset: number, alternate: boolean): string {
  const loose = list.items.some((item) => item.length > 1)
  const start = Math.max(0, list.start)
  return list.items
    .map((item, index) => {
      const marker = list.ordered ? `${start + index}${alternate ? ")" : "."}` : alternate ? "*" : "-"
      const body = renderBlocks(item, offset)
      if (!body) return marker
      const pad = " ".repeat(marker.length + 1)
      return body
        .split("\n")
        .map((line, i) => (i === 0 ? `${marker} ${line}` : line && pad + line))
        .join("\n")
    })
    .join(loose ? "\n\n" : "\n")
}

function renderParagraph(inlines: readonly Inline[]): string {
  const lines = inlineLines(inlines).map((runs) => escapeLineStart(renderLine(runs)))
  // A hard break can't start or end a paragraph in Markdown.
  while (lines.length > 0 && !lines[0]) lines.shift()
  while (lines.length > 0 && !lines.at(-1)) lines.pop()
  return lines.join("\\\n")
}

/** Inline content as lines of runs, split at line breaks and any newline in the text. */
function inlineLines(inlines: readonly Inline[]): Run[][] {
  const lines: Run[][] = [[]]
  for (const inline of inlines) {
    if (inline.type === "lineBreak") {
      lines.push([])
      continue
    }
    inline.text.split(/\r\n?|\n/).forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part) lines.at(-1)!.push({ text: part, marks: inline.marks })
    })
  }
  return lines
}

/**
 * One line of inline content: escaped text, with marks as Markdown delimiters. Where those wouldn't read back as
 * written (marks that cross, or a delimiter squeezed between a letter and punctuation), HTML tags instead.
 */
function renderLine(input: readonly Run[]): string {
  const runs = normalizeRuns(input)
  if (runs.length === 0) return ""
  const markdown = serializeRuns(runs, false)
  return sameText(parseInlines(markdown), runs) ? markdown : serializeRuns(runs, true)
}

const sameMarks = (a: readonly MarkName[], b: readonly MarkName[]) =>
  a.length === b.length && a.every((mark) => b.includes(mark))

/** Trims the line and merges runs; whitespace between runs keeps only the marks on both sides of it. */
function normalizeRuns(input: readonly Run[]): Run[] {
  const runs = input
    .map((run) => ({ text: run.text, marks: MARKS.filter((mark) => run.marks.includes(mark)) }))
    .filter((run) => run.text)
  while (runs.length > 0 && !runs[0].text.trim()) runs.shift()
  while (runs.length > 0 && !runs.at(-1)!.text.trim()) runs.pop()
  if (runs.length === 0) return []
  runs[0] = { ...runs[0], text: runs[0].text.trimStart() }
  runs[runs.length - 1] = { ...runs.at(-1)!, text: runs.at(-1)!.text.trimEnd() }

  const merged: Run[] = []
  runs.forEach((run, index) => {
    const marks = run.text.trim()
      ? run.marks
      : run.marks.filter((mark) => runs[index - 1].marks.includes(mark) && runs[index + 1].marks.includes(mark))
    const last = merged.at(-1)
    if (last && sameMarks(last.marks, marks)) last.text += run.text
    else merged.push({ text: run.text, marks })
  })
  return merged
}

/** How many characters, from run `from` on, keep `mark`. */
function lasts(runs: readonly Run[], from: number, mark: MarkName): number {
  let length = 0
  for (let i = from; i < runs.length && runs[i].marks.includes(mark); i++) length += runs[i].text.length
  return length
}

const DELIMITERS: Record<MarkName, string | null> = { bold: "**", italic: "*", strike: "~~", underline: null }
const TAGS: Record<MarkName, string> = { bold: "strong", italic: "em", strike: "del", underline: "u" }

function serializeRuns(runs: readonly Run[], html: boolean): string {
  interface Span {
    mark: MarkName
    html: boolean
  }
  const tag =  (span: Span, opening: boolean) =>
    span.html ? `<${opening ? "" : "/"}${TAGS[span.mark]}>` : DELIMITERS[span.mark]!
  // Spans still open, outermost first.
  const stack: Span[] = []
  let out = ""
  // Whitespace that ended the last run: it goes after any closing delimiters, which can't follow a space.
  let held = ""
  for (let i = 0; i <= runs.length; i++) {
    const run = runs[i] as Run | undefined
    const wanted = run?.marks ?? []
    const gone = stack.findIndex((span) => !wanted.includes(span.mark))
    const closing = gone >= 0 ? stack.splice(gone).reverse() : []
    out += closing.map((span) => tag(span, false)).join("") + held
    held = ""
    if (!run) break

    const isOpen = new Set(stack.map((span) => span.mark))
    // The mark that lasts longest goes outermost, so it needn't close and reopen.
    const opening = run.marks.filter((mark) => !isOpen.has(mark)).sort((a, b) => lasts(runs, i, b) - lasts(runs, i, a))
    const reopened = new Set(closing.map((span) => span.mark))
    const lead = opening.length > 0 ? /^\s*/.exec(run.text)![0] : ""
    out += lead
    for (const mark of opening) {
      // A delimiter right after closing the same kind would merge with it.
      const span = { mark, html: html || DELIMITERS[mark] === null || reopened.has(mark) }
      stack.push(span)
      out += tag(span, true)
    }
    const body = run.text.slice(lead.length)
    held = /\s*$/.exec(body)![0]
    out += escapeText(body.slice(0, body.length - held.length))
  }
  return out
}

const escapeText = (text: string) => text.replace(/[\\`*_~<[]/g, "\\$&").replace(/&(?=#?\w+;)/g, "\\&")

/** Escapes what would start a block at the start of a line: a heading, quote, list item or rule. */
function escapeLineStart(line: string): string {
  if (/^[#>+=-]/.test(line)) return `\\${line}`
  return line.replace(/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2")
}

/** Whether parsed inlines hold the runs' text with the same marks, ignoring marks on whitespace. */
function sameText(inlines: readonly Inline[], runs: readonly Run[]): boolean {
  const signature = (items: readonly (Inline | Run)[]) =>
    items
      .map((item) =>
        "text" in item ? item.text.replace(/\S/g, (char) => `${char}\u0000${item.marks.join()}\u0001`) : "\u0002",
      )
      .join("")
  return signature(inlines) === signature(runs)
}

// Parsing

const THEMATIC_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const DINKUS = /^\s*⁂\s*$/
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/
const QUOTE = /^ {0,3}> ?/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])(?=[ \t]|$)([ \t]*)(.*)$/

/**
 * Blocks from Markdown: paragraphs, headings (`#` and `##` become the editor's larger heading), scene breaks
 * (`***`, `---`, `* * *`, a lone `#` or `⁂`), quotes and lists. Front matter is skipped; links keep their text.
 * `levels`, when given, gets the level each top-level heading was written at (1 to 6), which import splits
 * chapters by.
 */
export function markdownToBlocks(markdown: string, levels?: Map<Block, number>): Block[] {
  const text = stripFrontMatter(normalizeNewlines(markdown))
  return parseBlocks(
    text.split("\n").map((line) => line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length))),
    levels,
  )
}

const FRONT_MATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?(?:---|\.\.\.)[ \t]*(?:\n|$)/

const normalizeNewlines = (markdown: string) => markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")

function stripFrontMatter(text: string): string {
  const match = FRONT_MATTER.exec(text)
  return match ? text.slice(match[0].length) : text
}

/** The YAML front matter's lines, between its `---` fences: "" when there's none. */
export const markdownFrontMatter = (markdown: string) => FRONT_MATTER.exec(normalizeNewlines(markdown))?.[1] ?? ""

interface ListItemStart {
  ordered: boolean
  delimiter: string
  start: number
  /** Columns a line needs to be indented by to continue the item. */
  contentIndent: number
  content: string
}

function listItemStart(line: string): ListItemStart | null {
  const match = LIST_ITEM.exec(line)
  if (!match) return null
  const [, indent, marker, spaces, rest] = match
  const ordered = /\d/.test(marker)
  // Content starts after the spaces, or after one when there are five or more.
  const gap = !rest || spaces.length > 4 ? 1 : spaces.length
  return {
    ordered,
    delimiter: ordered ? marker.slice(-1) : marker,
    start: ordered ? Number(marker.slice(0, -1)) : 1,
    contentIndent: indent.length + marker.length + gap,
    content: rest ? spaces.slice(gap) + rest : "",
  }
}

/** Whether the line starts a block even right after a paragraph line, rather than continuing it. */
function interruptsParagraph(line: string): boolean {
  if ([THEMATIC_BREAK, DINKUS, ATX_HEADING, QUOTE, FENCE].some((pattern) => pattern.test(line))) return true
  const item = listItemStart(line)
  return item !== null && item.content.trim() !== "" && (!item.ordered || item.start === 1)
}

function parseBlocks(lines: readonly string[], levels?: Map<Block, number>): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", inlines: parseInlines(paragraph.join("\n")) })
    paragraph = []
  }
  const pushHeading = (block: Block, written: number) => {
    levels?.set(block, written)
    blocks.push(block)
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      endParagraph()
      i++
      continue
    }
    if (paragraph.length > 0 && SETEXT_UNDERLINE.test(line)) {
      pushHeading({ type: "heading", level: 2, inlines: parseInlines(paragraph.join("\n")) }, line.trim().startsWith("=") ? 1 : 2)
      paragraph = []
      i++
      continue
    }
    if (paragraph.length > 0 && !interruptsParagraph(line)) {
      paragraph.push(line.trimStart())
      i++
      continue
    }
    endParagraph()
    if (THEMATIC_BREAK.test(line) || DINKUS.test(line)) {
      blocks.push(SCENE_BREAK)
      i++
      continue
    }
    const heading = ATX_HEADING.exec(line)
    if (heading) {
      const content = (heading[2] ?? "").trim()
      // A lone # is a manuscript's scene break.
      const level = heading[1].length >= 3 ? 3 : 2
      if (content) pushHeading({ type: "heading", level, inlines: parseInlines(content) }, heading[1].length)
      else blocks.push(SCENE_BREAK)
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      i = parseFence(lines, i, fence[1], blocks)
      continue
    }
    if (QUOTE.test(line)) {
      i = parseQuote(lines, i, blocks)
      continue
    }
    const item = listItemStart(line)
    if (item) {
      i = parseList(lines, i, item, blocks)
      continue
    }
    paragraph.push(line.trimStart())
    i++
  }
  endParagraph()
  return blocks
}

function parseQuote(lines: readonly string[], start: number, blocks: Block[]): number {
  const inner: string[] = []
  let i = start
  for (; i < lines.length; i++) {
    const line = lines[i]
    const prefix = QUOTE.exec(line)
    if (prefix) inner.push(line.slice(prefix[0].length))
    // A "lazy" line carries on the quote's paragraph.
    else if (line.trim() && inner.at(-1)?.trim() && !interruptsParagraph(line)) inner.push(line)
    else break
  }
  blocks.push({ type: "quote", blocks: parseBlocks(inner) })
  return i
}

function parseList(lines: readonly string[], start: number, first: ListItemStart, blocks: Block[]): number {
  const items: Block[][] = []
  let i = start
  let item: ListItemStart | null = first
  while (item) {
    const body = [item.content]
    for (i++; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) body.push("")
      else if (/^ */.exec(line)![0].length >= item.contentIndent) body.push(line.slice(item.contentIndent))
      // In a list, any marker starts the next item (or list), even one that couldn't interrupt a paragraph.
      else if (body.at(-1)!.trim() && !interruptsParagraph(line) && !listItemStart(line)) body.push(line)
      else break
    }
    items.push(parseBlocks(body))
    const next = i < lines.length && !THEMATIC_BREAK.test(lines[i]) ? listItemStart(lines[i]) : null
    item = next && next.ordered === first.ordered && next.delimiter === first.delimiter ? next : null
  }
  blocks.push({ type: "list", ordered: first.ordered, start: first.start, items })
  return i
}

/** A fenced code block: its lines, kept as written. */
function parseFence(lines: readonly string[], start: number, fence: string, blocks: Block[]): number {
  const closing = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`)
  const body: string[] = []
  let i = start + 1
  while (i < lines.length && !closing.test(lines[i])) body.push(lines[i++])
  if (body.some((line) => line.trim())) {
    const inlines: Inline[] = []
    body.forEach((line, index) => {
      if (index > 0) inlines.push({ type: "lineBreak" })
      if (line) inlines.push({ type: "text", text: line, marks: [] })
    })
    blocks.push({ type: "paragraph", inlines })
  }
  return Math.min(i + 1, lines.length)
}

// Inline parsing: CommonMark's delimiter algorithm for * and _, GFM's for ~~, and a few HTML tags.

interface Delimiter {
  kind: "delimiter"
  char: "*" | "_" | "~"
  length: number
  /** Characters not used up by a match: they stay as text. */
  count: number
  canOpen: boolean
  canClose: boolean
  active: boolean
}

type InlineToken = { kind: "text"; text: string } | { kind: "break" } | { kind: "tag"; mark: MarkName; open: boolean } | Delimiter

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char)
const isPunctuation = (char: string | undefined) => char !== undefined && /[\p{P}\p{S}]/u.test(char)

const TAG_MARKS: Record<string, MarkName> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  ins: "underline",
  s: "strike",
  del: "strike",
  strike: "strike",
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
}

const COMMENT = /<!--[\s\S]*?-->/y
const AUTOLINK = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/y
const HTML_TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?\/?>/y
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/y

function matchAt(pattern: RegExp, source: string, at: number) {
  pattern.lastIndex = at
  return pattern.exec(source)
}

const fromCodePoint = (code: number) =>
  code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "\ufffd"

/** Inline content of one paragraph or heading, its lines joined by "\n" and their indentation removed. */
export function parseInlines(source: string): Inline[] {
  const tokens: InlineToken[] = []
  let text = ""
  const flush = () => {
    if (text) tokens.push({ kind: "text", text })
    text = ""
  }
  // Where a link's text ends: skip past its destination.
  const skips = new Map<number, number>()
  let i = 0
  while (i < source.length) {
    const skip = skips.get(i)
    if (skip !== undefined) {
      i = skip
      continue
    }
    const char = source[i]
    if (char === "\\" && source[i + 1] === "\n") {
      flush()
      tokens.push({ kind: "break" })
      i += 2
      continue
    }
    if (char === "\\" && i + 1 < source.length && ASCII_PUNCTUATION.test(source[i + 1])) {
      text += source[i + 1]
      i += 2
      continue
    }
    if (char === "\n") {
      // Two spaces before a line's end make a hard break; otherwise lines join with a space.
      const hard = / {2,}$/.test(text)
      text = text.replace(/[ \t]+$/, "")
      if (hard) {
        flush()
        tokens.push({ kind: "break" })
      } else text += " "
      i++
      continue
    }
    if (char === "*" || char === "_" || char === "~") {
      let end = i
      while (source[end] === char) end++
      const length = end - i
      if (char === "~" && length > 2) {
        text += source.slice(i, end)
        i = end
        continue
      }
      const before = source[i - 1]
      const after = source[end]
      const leftFlanking = !isSpace(after) && (!isPunctuation(after) || isSpace(before) || isPunctuation(before))
      const rightFlanking = !isSpace(before) && (!isPunctuation(before) || isSpace(after) || isPunctuation(after))
      flush()
      tokens.push({
        kind: "delimiter",
        char,
        length,
        count: length,
        // An underscore inside a word is just an underscore.
        canOpen: char === "_" ? leftFlanking && (!rightFlanking || isPunctuation(before)) : leftFlanking,
        canClose: char === "_" ? rightFlanking && (!leftFlanking || isPunctuation(after)) : rightFlanking,
        active: true,
      })
      i = end
      continue
    }
    if (char === "`") {
      let end = i
      while (source[end] === "`") end++
      const close = closingBackticks(source, end, end - i)
      if (close < 0) {
        text += source.slice(i, end)
        i = end
        continue
      }
      let code = source.slice(end, close).replace(/\n/g, " ")
      if (code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1)
      text += code
      i = close + (end - i)
      continue
    }
    if (char === "<") {
      const comment = matchAt(COMMENT, source, i)
      if (comment) {
        i += comment[0].length
        continue
      }
      const autolink = matchAt(AUTOLINK, source, i)
      if (autolink) {
        text += autolink[1]
        i += autolink[0].length
        continue
      }
      const tag = matchAt(HTML_TAG, source, i)
      if (tag) {
        const name = tag[2].toLowerCase()
        if (name === "br") {
          flush()
          tokens.push({ kind: "break" })
        } else if (Object.hasOwn(TAG_MARKS, name)) {
          flush()
          tokens.push({ kind: "tag", mark: TAG_MARKS[name], open: !tag[1] })
        }
        // Other tags are dropped, and what they enclose kept.
        i += tag[0].length
        continue
      }
    }
    if (char === "&") {
      const entity = matchAt(ENTITY, source, i)
      const decoded = !entity
        ? undefined
        : entity[1]
          ? fromCodePoint(Number(entity[1]))
          : entity[2]
            ? fromCodePoint(parseInt(entity[2], 16))
            : Object.hasOwn(ENTITIES, entity[3])
              ? ENTITIES[entity[3]]
              : undefined
      if (entity && decoded !== undefined) {
        text += decoded
        i += entity[0].length
        continue
      }
    }
    if (char === "[" || (char === "!" && source[i + 1] === "[")) {
      const open = char === "[" ? i : i + 1
      const link = linkAt(source, open)
      if (link) {
        skips.set(link.textEnd, link.end)
        i = open + 1
        continue
      }
    }
    text += char
    i++
  }
  flush()
  return inlinesOf(tokens, matchDelimiters(tokens))
}

function closingBackticks(source: string, from: number, ticks: number): number {
  let i = source.indexOf("`", from)
  while (i >= 0) {
    let end = i
    while (source[end] === "`") end++
    if (end - i === ticks) return i
    i = source.indexOf("`", end)
  }
  return -1
}

/** `[text](destination)` with its `[` at `open`: where the text ends and the whole link does. */
function linkAt(source: string, open: number): { textEnd: number; end: number } | null {
  let depth = 0
  let i = open
  for (; i < source.length; i++) {
    if (source[i] === "\\") i++
    else if (source[i] === "[") depth++
    else if (source[i] === "]" && --depth === 0) break
  }
  if (source[i + 1] !== "(") return null
  const textEnd = i
  let parens = 0
  for (i = textEnd + 1; i < source.length; i++) {
    if (source[i] === "\\") i++
    else if (source[i] === "(") parens++
    else if (source[i] === ")" && --parens === 0) return { textEnd, end: i + 1 }
  }
  return null
}

interface MarkSpan {
  open: number
  close: number
  mark: MarkName
}

function matchDelimiters(tokens: InlineToken[]): MarkSpan[] {
  const spans: MarkSpan[] = []
  tokens.forEach((closer, c) => {
    if (closer.kind !== "delimiter" || !closer.canClose) return
    while (closer.count > 0) {
      const o = findOpener(tokens, c, closer)
      if (o < 0) break
      const opener = tokens[o] as Delimiter
      const use = closer.char === "~" ? closer.count : Math.min(2, opener.count, closer.count)
      spans.push({ open: o, close: c, mark: closer.char === "~" ? "strike" : use === 2 ? "bold" : "italic" })
      opener.count -= use
      closer.count -= use
      // Delimiters inside the match can't pair with anything outside it.
      for (let k = o + 1; k < c; k++) {
        const between = tokens[k]
        if (between.kind === "delimiter") between.active = false
      }
    }
  })
  return spans
}

function findOpener(tokens: readonly InlineToken[], closerIndex: number, closer: Delimiter): number {
  for (let o = closerIndex - 1; o >= 0; o--) {
    const opener = tokens[o]
    if (opener.kind !== "delimiter" || opener.char !== closer.char) continue
    if (!opener.active || !opener.canOpen || opener.count === 0) continue
    if (closer.char === "~") {
      if (opener.count === closer.count) return o
      continue
    }
    // CommonMark's "rule of 3", which keeps `*a**b*` from pairing the wrong way.
    const sum = opener.length + closer.length
    const both = opener.canClose || closer.canOpen
    if (both && sum % 3 === 0 && (opener.length % 3 !== 0 || closer.length % 3 !== 0)) continue
    return o
  }
  return -1
}

function inlinesOf(tokens: readonly InlineToken[], spans: readonly MarkSpan[]): Inline[] {
  const tagDepth: Record<MarkName, number> = { bold: 0, italic: 0, underline: 0, strike: 0 }
  const inlines: Inline[] = []
  tokens.forEach((token, index) => {
    if (token.kind === "tag") {
      tagDepth[token.mark] = Math.max(0, tagDepth[token.mark] + (token.open ? 1 : -1))
      return
    }
    if (token.kind === "break") {
      inlines.push({ type: "lineBreak" })
      return
    }
    const text = token.kind === "text" ? token.text : token.char.repeat(token.count)
    if (!text) return
    const marks = MARKS.filter(
      (mark) =>
        tagDepth[mark] > 0 || spans.some((span) => span.mark === mark && span.open < index && index < span.close),
    )
    const last = inlines.at(-1)
    if (last?.type === "text" && sameMarks(last.marks, marks)) last.text += text
    else inlines.push({ type: "text", text, marks })
  })
  const first = inlines[0]
  if (first?.type === "text") first.text = first.text.trimStart()
  const last = inlines.at(-1)
  if (last?.type === "text") last.text = last.text.trimEnd()
  return inlines.filter((inline) => inline.type !== "text" || inline.text)
}
