import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import * as Y from "yjs"
import { PROSE_FIELD } from "@/yjs/prose"

/*
 * Find and replace (DESIGN.md §8 "Writing aids"), apart from the screen. Prose is searched a run at a time: a
 * paragraph or heading, or the part of one between line breaks. A match can't run across two, as it couldn't be
 * replaced as one stretch of text. The panel searches the scene docs; an editor finds the same runs in its own
 * document, so the nth match of a scene is the same words in both.
 */

export interface FindOptions {
  query: string
  matchCase: boolean
  wholeWord: boolean
  /** The query is a pattern (a regular expression) rather than the words themselves. */
  pattern: boolean
}

/** A search ready to run, or why it can't. */
export type CompiledFind = { regex: RegExp; error?: undefined } | { regex?: undefined; error: string }

export const PATTERN_ERROR = "This pattern has a mistake in it, so nothing was searched."

const ELLIPSIS = "(?:\\.\\.\\.|…)"
const DASH = "(?:--|—)"

/** What the editor turns typing into (curly quotes, dashes, ellipses), so a search typed either way finds both. */
const PLAIN_FORMS: Record<string, string> = {
  "'": "['‘’]",
  "‘": "['‘’]",
  "’": "['‘’]",
  '"': '["“”]',
  "“": '["“”]',
  "”": '["“”]',
  "…": ELLIPSIS,
  "—": DASH,
  " ": "[ \\u00a0]",
}

const SPECIAL = /[\\^$.*+?()[\]{}|/]/g

/** Text as a pattern that finds just that text. */
export const escapePattern = (text: string) => text.replace(SPECIAL, "\\$&")

function plainSource(query: string): string {
  let source = ""
  for (let index = 0; index < query.length; ) {
    if (query.startsWith("...", index)) {
      source += ELLIPSIS
      index += 3
    } else if (query.startsWith("--", index)) {
      source += DASH
      index += 2
    } else {
      const char = String.fromCodePoint(query.codePointAt(index) ?? 0)
      source += PLAIN_FORMS[char] ?? escapePattern(char)
      index += char.length
    }
  }
  return source
}

/** A letter, digit or underscore: what a whole word can't have on either side. Marks count, for accented letters. */
const WORD_CHAR = "[\\p{L}\\p{M}\\p{N}_]"

/** The search for a query, or null when there's nothing to search for. */
export function compileFind({ query, matchCase, wholeWord, pattern }: FindOptions): CompiledFind | null {
  if (!query) return null
  let source = pattern ? query : plainSource(query)
  if (wholeWord) source = `(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})`
  try {
    return { regex: new RegExp(source, matchCase ? "gu" : "giu") }
  } catch {
    return { error: PATTERN_ERROR }
  }
}

/** The matches in a piece of text, in order, up to `limit`. Empty ones are left out: `a*` matches nothing anywhere. */
export function matchesIn(text: string, regex: RegExp, limit = Infinity): RegExpExecArray[] {
  if (!regex.global) throw new Error("matchesIn needs a global regex")
  const found: RegExpExecArray[] = []
  regex.lastIndex = 0
  while (found.length < limit) {
    const match = regex.exec(text)
    if (!match) break
    if (match[0]) found.push(match)
    else regex.lastIndex += (text.codePointAt(regex.lastIndex) ?? 0) > 0xffff ? 2 : 1
  }
  regex.lastIndex = 0
  return found
}

/**
 * What a match is replaced with: the replacement as typed, or for a pattern with $1, $<name>, $& (the whole match)
 * and $$ (a dollar sign) filled in, as JavaScript fills them in.
 */
export function expandReplacement(replacement: string, match: RegExpExecArray, pattern: boolean): string {
  if (!pattern || !replacement.includes("$")) return replacement
  const groups = match.length - 1
  return replacement.replace(
    /\$(?:(\$)|(&)|<([^>]*)>|(\d)(\d)?)/g,
    (token, dollar?: string, whole?: string, name?: string, first?: string, second?: string) => {
      if (dollar) return "$"
      if (whole) return match[0]
      if (name !== undefined) return match.groups ? (match.groups[name] ?? "") : token
      const two = Number(`${first}${second ?? ""}`)
      if (second !== undefined && two >= 1 && two <= groups) return match[two] ?? ""
      const one = Number(first)
      if (one >= 1 && one <= groups) return (match[one] ?? "") + (second ?? "")
      return token
    },
  )
}

/** A stretch of prose a match can't run past: a paragraph or heading, or a line of one between line breaks. */
export interface Run {
  text: string
}

/** Where some of a run's characters sit in a Y.XmlText: `length` of them from `index`, `offset` on in the run. */
export interface YPart {
  node: Y.XmlText
  index: number
  offset: number
  length: number
}

export interface YRun extends Run {
  parts: YPart[]
}

/** A run in an editor's document, from position `pos`: its text nodes sit side by side, a position a character. */
export interface PmRun extends Run {
  pos: number
}

type YNode = Y.XmlElement | Y.XmlText | Y.XmlHook

const isInline = (node: YNode) =>
  node instanceof Y.XmlText || (node instanceof Y.XmlElement && node.nodeName === "hardBreak")

/** A scene doc's runs, in reading order, with where each one's text sits so it can be replaced. */
export function yRuns(doc: Y.Doc): YRun[] {
  const runs: YRun[] = []
  let run: YRun = { text: "", parts: [] }
  const startRun = () => {
    run = { text: "", parts: [] }
    runs.push(run)
  }
  const addText = (node: Y.XmlText) => {
    let index = 0
    for (const op of node.toDelta() as { insert: unknown }[]) {
      if (typeof op.insert !== "string") {
        // Something other than text, which no match can take in.
        index += 1
        startRun()
        continue
      }
      const last = run.parts.at(-1)
      if (last?.node === node && last.index + last.length === index) last.length += op.insert.length
      else run.parts.push({ node, index, offset: run.text.length, length: op.insert.length })
      run.text += op.insert
      index += op.insert.length
    }
  }
  const block = (node: YNode) => {
    if (node instanceof Y.XmlText) {
      startRun()
      addText(node)
      return
    }
    if (!(node instanceof Y.XmlElement)) return
    const children = node.toArray()
    // Blocks of text hold text and line breaks. Quotes and lists hold blocks.
    if (!children.every(isInline)) {
      children.forEach(block)
      return
    }
    startRun()
    for (const child of children) {
      if (child instanceof Y.XmlText) addText(child)
      else startRun()
    }
  }
  doc.getXmlFragment(PROSE_FIELD).toArray().forEach(block)
  return runs
}

/** An editor document's runs, in reading order. */
export function pmRuns(doc: ProseMirrorNode): PmRun[] {
  const runs: PmRun[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let run: PmRun = { text: "", pos: pos + 1 }
    runs.push(run)
    node.forEach((child, offset) => {
      if (child.isText) {
        run.text += child.text ?? ""
        return
      }
      run = { text: "", pos: pos + 1 + offset + child.nodeSize }
      runs.push(run)
    })
    return false
  })
  return runs
}

/** A match in a scene: its run, and where it is in the run's text. Its place in the scene's list is its ordinal. */
export interface RunMatch {
  run: number
  start: number
  end: number
}

export function findInRuns(runs: readonly Run[], regex: RegExp, limit = Infinity): RunMatch[] {
  const found: RunMatch[] = []
  for (const [index, run] of runs.entries()) {
    if (found.length >= limit) break
    for (const match of matchesIn(run.text, regex, limit - found.length)) {
      found.push({ run: index, start: match.index, end: match.index + match[0].length })
    }
  }
  return found
}

export interface TextRange {
  from: number
  to: number
}

/** The matches in an editor's document, as ranges there. */
export function docMatches(doc: ProseMirrorNode, regex: RegExp, limit = Infinity): TextRange[] {
  const runs = pmRuns(doc)
  return findInRuns(runs, regex, limit).map(({ run, start, end }) => ({
    from: runs[run].pos + start,
    to: runs[run].pos + end,
  }))
}

/** The formatting of the character at `index`, as Y.Text attributes. */
function formatAt(node: Y.XmlText, index: number): Record<string, unknown> {
  let at = 0
  for (const op of node.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    const length = typeof op.insert === "string" ? op.insert.length : 1
    if (index < at + length) return { ...op.attributes }
    at += length
  }
  return {}
}

function replaceInRun(run: YRun, start: number, end: number, text: string) {
  const parts = run.parts.filter((part) => part.offset < end && part.offset + part.length > start)
  const first = parts[0]
  if (!first) return
  const at = first.index + Math.max(0, start - first.offset)
  const format = formatAt(first.node, at)
  for (const part of parts.reverse()) {
    const from = Math.max(start, part.offset)
    const to = Math.min(end, part.offset + part.length)
    part.node.delete(part.index + from - part.offset, to - from)
  }
  if (text) first.node.insert(at, text, format)
}

/**
 * Replaces every match in a scene doc, in one transaction with `origin`. Each replacement takes the formatting of the
 * first character it replaces. Returns how many it replaced.
 */
export function replaceAllInDoc(
  doc: Y.Doc,
  regex: RegExp,
  replacement: string,
  pattern: boolean,
  origin: unknown,
): number {
  const runs = yRuns(doc)
  const edits = runs.flatMap((run) =>
    matchesIn(run.text, regex).map((match) => ({
      run,
      start: match.index,
      end: match.index + match[0].length,
      text: expandReplacement(replacement, match, pattern),
    })),
  )
  if (edits.length === 0) return 0
  doc.transact(() => {
    // Last first, so the places worked out for the ones before stay right.
    for (const edit of edits.reverse()) replaceInRun(edit.run, edit.start, edit.end, edit.text)
  }, origin)
  return edits.length
}

export interface Snippet {
  before: string
  match: string
  after: string
}

const SNIPPET_BEFORE = 32
const SNIPPET_AFTER = 72
const SNIPPET_MATCH = 120

/** A match with some of the text around it for a list of results, cut at spaces, with "…" where it's cut. */
export function snippetOf(text: string, start: number, end: number): Snippet {
  let from = Math.max(0, start - SNIPPET_BEFORE)
  if (from > 0) {
    const space = text.indexOf(" ", from)
    if (space !== -1 && space < start) from = space + 1
  }
  let to = Math.min(text.length, end + SNIPPET_AFTER)
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to)
    if (space > end) to = space
  }
  const match = text.slice(start, end)
  return {
    before: (from > 0 ? "…" : "") + text.slice(from, start),
    match: match.length > SNIPPET_MATCH ? `${match.slice(0, SNIPPET_MATCH)}…` : match,
    after: text.slice(end, to) + (to < text.length ? "…" : ""),
  }
}
