import { blocksText, tidyBlocks, type Block } from "@/export/blocks"
import { countWords } from "@/lib/words"
import type { DraftChapter, DraftScene, Outline } from "./outline"
import { headingLines, type HeadingPiece, type Piece } from "./pieces"

/*
 * Cutting a manuscript into acts, chapters and scenes for import (DESIGN.md §13). Chapters start at the headings of
 * one level, at lines like "Chapter 12" or "Prologue", or nowhere: the whole text is one chapter. Headings above
 * the chapters' level, and lines like "Part Two", start acts; headings a level below start scenes, and so do scene
 * breaks, unless the writer would rather keep each chapter whole. What comes before the first chapter is front
 * matter, left out to begin with when it's short: a title page, a dedication. The writer sees the result, and can
 * change it, before anything's imported.
 */

export type SplitMode = { kind: "headings"; level: number } | { kind: "lines" } | { kind: "none" }

export interface SplitSettings {
  mode: SplitMode
  /** Whether scene breaks, and the headings a level below the chapters', start new scenes. */
  scenes: boolean
}

export interface SplitChoice {
  mode: SplitMode
  /** How many chapters it makes, front matter aside. */
  chapters: number
}

export interface Analysis {
  /** The heading that's the book's title rather than a chapter's, by its index in the pieces. */
  titleIndex: number | null
  choices: SplitChoice[]
  /** The likeliest way the book's split. */
  settings: SplitSettings
}

/** Front matter shorter than this is left out to begin with: a title page, a dedication, a contents page. */
export const FRONT_MATTER_WORDS = 500

/** A mode as a string, for a select's value: "h1", "lines", "none". */
export const modeKey = (mode: SplitMode) => (mode.kind === "headings" ? `h${mode.level}` : mode.kind)

const NUMBER_WORD = String.raw`(?:(?:one[\s-])?hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`
// Looked for on both sides, so it can't match nothing.
const ROMAN = String.raw`(?=[ivxlcdm])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})(?<=[ivxlcdm])`
const NUMBER = String.raw`(?:\d{1,4}|${ROMAN}|${NUMBER_WORD})`
const ORDINAL = String.raw`(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|the\s+\p{L}+)`
/** After a label: a separator and maybe a title ("Chapter 3: The Ferry", "Chapter 3."), or a space and a title. */
const REST = String.raw`(?:\s*[:.,\-–—]\s*(.*)|\s+(.+))?`

const CHAPTER_LINE = new RegExp(String.raw`^(?:chapter|chap\.|ch\.)\s*(?:${NUMBER}|${ORDINAL})\b${REST}$`, "iu")
const UNNUMBERED_LINE = new RegExp(
  String.raw`^(?:prologue|epilogue|interlude|foreword|preface|afterword|introduction|prelude|postscript|coda)\b${REST}$`,
  "iu",
)
const PART_LINE = new RegExp(String.raw`^(?:part|book|volume|act)\s+(?:${NUMBER}|${ORDINAL})\b${REST}$`, "iu")
const BARE_LINE = new RegExp(String.raw`^(${NUMBER})\b(?:\.?|[.:]\s+(.+))$`, "iu")
const THE_END = /^(?:the\s+)?end\.?$/i
const CONTENTS = /^(?:table\s+of\s+)?contents$/i
const PARTICLE = String.raw`(?:de|da|di|du|van|von|der|den|la|le|del)`
/** A word of a name ("Ann", "O'Brien", "J.R.R.", "van", "deLancey"), or "and" or "&" between names. */
const NAME_WORD = String.raw`(?:${PARTICLE}?\p{Lu}[\p{L}'’.-]*|${PARTICLE}|and|&)`
// Space between the words is required: were it optional, a line in capitals that isn't a "by" line ("BY ARRANGEMENT
// WITH…, 1999") would be cut into words every way there is before it failed, which takes minutes.
const BYLINE = new RegExp(String.raw`^(?:by|By|BY)\s+${NAME_WORD}(?:\s+${NAME_WORD})*\s*$`, "u")

/** What follows a label, as a title ("" for none); null when it reads as a sentence going on: "Chapter 3 of the…". */
function afterLabel(match: RegExpExecArray | null): string | null {
  if (!match) return null
  const [, separated, spaced] = match
  if (spaced !== undefined && /^\p{Ll}/u.test(spaced)) return null
  return (separated ?? spaced ?? "").trim()
}

interface ChapterHeading {
  /** The chapter's own title, without a "Chapter 3" label: "" when the label is all there is. */
  title: string
  /** Just a label, so a title straight after it is the chapter's. */
  labelOnly: boolean
}

/** A chapter's heading by its words: "Chapter 3: The Ferry", "Chapter Twelve", "Prologue". */
function chapterHeading(lines: readonly string[]): ChapterHeading | null {
  const [first = "", ...rest] = lines
  const labelled = afterLabel(CHAPTER_LINE.exec(first))
  if (labelled !== null) {
    const title = [labelled, ...rest].filter(Boolean).join(" ")
    return { title, labelOnly: !title }
  }
  if (afterLabel(UNNUMBERED_LINE.exec(first)) !== null) return { title: lines.join(": "), labelOnly: false }
  return null
}

const isChapterLabel = (lines: readonly string[]) => afterLabel(CHAPTER_LINE.exec(lines[0] ?? "")) !== null

const isPartHeading = (lines: readonly string[]) => afterLabel(PART_LINE.exec(lines[0] ?? "")) !== null

const actTitle = (lines: readonly string[]) => lines.join(": ")

const UNITS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ")
const TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ")
const ROMAN_DIGITS: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

/** A number's value, written in digits, Roman numerals or words. */
export function numberValue(text: string): number | null {
  const value = text.toLowerCase()
  if (/^\d+$/.test(value)) return Number(value)
  if (/^[ivxlcdm]+$/.test(value)) {
    let total = 0
    for (let i = 0; i < value.length; i++) {
      const digit = ROMAN_DIGITS[value[i]]
      total += i + 1 < value.length && digit < ROMAN_DIGITS[value[i + 1]] ? -digit : digit
    }
    return total
  }
  if (/hundred$/.test(value)) return 100
  let total = 0
  for (const word of value.split(/[\s-]+/)) {
    if (UNITS.includes(word)) total += UNITS.indexOf(word)
    else if (TENS.includes(word)) total += (TENS.indexOf(word) + 2) * 10
    else return null
  }
  return total
}

/** A chapter's heading by its number alone: "12", "XII", "Twelve", "4. The Ferry". */
function bareHeading(lines: readonly string[]): { value: number | null; heading: ChapterHeading } | null {
  const [first = "", ...rest] = lines
  const match = BARE_LINE.exec(first)
  if (!match || (match[2] !== undefined && /^\p{Ll}/u.test(match[2]))) return null
  const title = [match[2]?.trim() ?? "", ...rest].filter(Boolean).join(" ")
  return { value: numberValue(match[1]), heading: { title, labelOnly: !title } }
}

/** A title as kept: one space between words, and no full stop at the end ("CHAPTER I. THE PERIOD."). */
const tidyTitle = (title: string) => title.replace(/\s+/g, " ").trim().replace(/(?<!\.)\.$/, "")

/** A paragraph short enough to be a heading typed as plain text: its lines, or null. */
function shortLines(block: Block): string[] | null {
  if (block.type !== "paragraph") return null
  const lines = headingLines(block.inlines)
  if (lines.length === 0 || lines.length > 3 || lines[0].length > 120) return null
  return countWords(lines.join(" ")) <= 20 ? lines : null
}

/** The lines of a piece that could be a heading: a heading's, or a short paragraph's. */
const pieceLines = (piece: Piece) => (piece.type === "heading" ? headingLines(piece.inlines) : shortLines(piece.block))

const isTheEnd = (piece: Piece) => {
  const lines = pieceLines(piece)
  return lines?.length === 1 && THE_END.test(lines[0])
}

/** A contents page's heading, which neither titles the book nor starts a chapter. */
const isContentsHeading = (piece: Piece) => piece.type === "heading" && CONTENTS.test(headingLines(piece.inlines).join(" "))

type Role =
  | { role: "skip" }
  | { role: "act"; title: string }
  /** `plain` when it's only a heading at the chapters' level, saying nothing of chapters. */
  | { role: "chapter"; heading: ChapterHeading; plain: boolean }
  | { role: "scene"; title: string }
  /** A scene break that starts a new scene. */
  | { role: "break" }
  | { role: "block"; block: Block }

const levelsOf = (pieces: readonly Piece[], skip: number | null) =>
  [
    ...new Set(
      pieces.flatMap((piece, index) =>
        piece.type === "heading" && index !== skip && !isContentsHeading(piece) ? [piece.level] : [],
      ),
    ),
  ].sort((a, b) => a - b)

/**
 * Which bare numbers start chapters: only in a book where none says "Chapter", and only counting up, 1, 2, 3. The
 * count can start again from 1, as it does in each part of some books, and after a contents page.
 */
function bareChapters(pieces: readonly Piece[], skip: number | null): Map<number, ChapterHeading> {
  const found = new Map<number, ChapterHeading>()
  const bare: { index: number; value: number; heading: ChapterHeading }[] = []
  for (const [index, piece] of pieces.entries()) {
    const lines = index === skip ? null : pieceLines(piece)
    if (!lines) continue
    if (isChapterLabel(lines)) return found
    const candidate = bareHeading(lines)
    if (candidate && candidate.value !== null) bare.push({ index, value: candidate.value, heading: candidate.heading })
  }
  let expected: number | null = null
  bare.forEach((candidate, k) => {
    const countsOn = bare[k + 1]?.value === candidate.value + 1
    const starts = expected === null ? candidate.value <= 1 || countsOn : candidate.value <= 1 && countsOn
    if (candidate.value !== expected && !starts) return
    found.set(candidate.index, candidate.heading)
    expected = candidate.value + 1
  })
  return found
}

/** What each piece is, split the way the settings say. */
function rolesOf(pieces: readonly Piece[], titleIndex: number | null, settings: SplitSettings): Role[] {
  const { mode, scenes } = settings
  const chapterLevel = mode.kind === "headings" ? mode.level : null
  const levels = levelsOf(pieces, titleIndex)
  const sceneLevel = chapterLevel === null ? null : (levels.find((level) => level > chapterLevel) ?? null)
  // Headings kept in the prose: the first level of them the editor's bigger heading, deeper ones its smaller.
  const topLevel = chapterLevel === null ? (levels[0] ?? null) : sceneLevel
  // A book whose chapter headings say "Chapter 3" may have a chapter or two typed without the heading style.
  const chapterLines =
    mode.kind === "lines" ||
    pieces.some(
      (piece, index) =>
        index !== titleIndex &&
        piece.type === "heading" &&
        piece.level === chapterLevel &&
        isChapterLabel(headingLines(piece.inlines)),
    )
  const bare = mode.kind === "lines" ? bareChapters(pieces, titleIndex) : new Map<number, ChapterHeading>()
  const lineRole = (lines: readonly string[], index: number): Role | null => {
    if (mode.kind === "lines" && isPartHeading(lines)) return { role: "act", title: actTitle(lines) }
    const heading = chapterHeading(lines) ?? bare.get(index)
    return heading ? { role: "chapter", heading, plain: false } : null
  }
  const contentHeading = (piece: HeadingPiece): Block => ({
    type: "heading",
    level: topLevel === null || piece.level <= topLevel ? 2 : 3,
    inlines: piece.inlines,
    ...(piece.center ? { center: true } : {}),
  })

  const roles = pieces.map((piece, index): Role => {
    if (index === titleIndex || isContentsHeading(piece) || (index === pieces.length - 1 && isTheEnd(piece))) {
      return { role: "skip" }
    }
    if (piece.type === "heading") {
      const lines = headingLines(piece.inlines)
      if (chapterLevel !== null && piece.level <= chapterLevel) {
        if (isPartHeading(lines)) return { role: "act", title: actTitle(lines) }
        const heading = chapterHeading(lines) ?? (piece.level === chapterLevel ? bareHeading(lines)?.heading : null)
        if (heading) return { role: "chapter", heading, plain: false }
        if (piece.level < chapterLevel) return { role: "act", title: actTitle(lines) }
        return { role: "chapter", heading: { title: lines.join(" "), labelOnly: false }, plain: true }
      }
      if (scenes && sceneLevel !== null && piece.level === sceneLevel) return { role: "scene", title: lines.join(" ") }
      const role = mode.kind === "lines" ? lineRole(lines, index) : null
      return role ?? { role: "block", block: contentHeading(piece) }
    }
    const block = piece.block
    if (block.type === "break") return scenes ? { role: "break" } : { role: "block", block }
    const lines = chapterLines ? shortLines(block) : null
    return (lines && lineRole(lines, index)) || { role: "block", block }
  })
  if (mode.kind === "lines") {
    // A heading straight before a chapter's line, saying nothing of chapters itself, is its part's: "The Coast", "Chapter 1".
    roles.forEach((role, index) => {
      const piece = pieces[index]
      if (role.role === "block" && piece.type === "heading" && roles[index + 1]?.role === "chapter") {
        roles[index] = { role: "act", title: actTitle(headingLines(piece.inlines)) }
      }
    })
  }
  return roles
}

/** A paragraph that reads as a title rather than prose: one short line, centred, in capitals, or not ending as a sentence would. */
function titleLine(block: Block): string | null {
  if (block.type !== "paragraph") return null
  const lines = headingLines(block.inlines)
  if (lines.length !== 1 || countWords(lines[0]) > 12) return null
  const [line] = lines
  // Two letters at least: "I." is a sentence.
  const capitals = (line.match(/\p{Lu}/gu)?.length ?? 0) >= 2 && !/\p{Ll}/u.test(line)
  return block.center || capitals || !/[.!?…:;,"'”’)\]\-–—]$/u.test(line) ? line : null
}

/** The title a chapter heading that's just a label takes from what follows it: a heading, or a line that reads as one. */
function titleAfter(piece: Piece | undefined, role: Role | undefined): string | null {
  if (!piece || !role) return null
  if (piece.type === "heading") {
    const plain = role.role === "scene" || role.role === "block" || (role.role === "chapter" && role.plain)
    return plain ? headingLines(piece.inlines).join(" ") : null
  }
  return role.role === "block" ? titleLine(piece.block) : null
}

interface Building {
  title: string
  /** The heading's words as written, to tell a contents page's line from the chapter it lists. */
  heading: string
  act: string | null
  /** Before the first chapter's heading, or between an act's heading and its first chapter's. */
  front: boolean
  scenes: { title: string; blocks: Block[] }[]
}

function buildChapters(pieces: readonly Piece[], titleIndex: number | null, settings: SplitSettings): Building[] {
  const roles = rolesOf(pieces, titleIndex, settings)
  const built: Building[] = []
  let chapter: Building | null = null
  let sceneOpen = false
  let act: string | null = null
  const open = (title: string, heading: string, front: boolean): Building => {
    const next: Building = { title: tidyTitle(title), heading, act, front, scenes: [] }
    built.push(next)
    act = null
    sceneOpen = false
    return next
  }

  for (let i = 0; i < pieces.length; i++) {
    const role = roles[i]
    switch (role.role) {
      case "skip":
        break
      case "act":
        act = tidyTitle(role.title)
        chapter = null
        break
      case "chapter": {
        const heading = pieceLines(pieces[i])?.join(" ") ?? ""
        let title = role.heading.title
        // "Chapter 3", then its title on a line of its own.
        const after = role.heading.labelOnly ? titleAfter(pieces[i + 1], roles[i + 1]) : null
        if (after !== null) {
          title = after
          i++
        }
        chapter = open(title, heading, false)
        break
      }
      case "scene":
        chapter ??= open("", "", true)
        chapter.scenes.push({ title: tidyTitle(role.title), blocks: [] })
        sceneOpen = true
        break
      case "break":
        sceneOpen = false
        break
      case "block":
        chapter ??= open("", "", true)
        if (!sceneOpen) {
          chapter.scenes.push({ title: "", blocks: [] })
          sceneOpen = true
        }
        chapter.scenes[chapter.scenes.length - 1].blocks.push(role.block)
        break
    }
  }
  return built
}

/** A heading's words, to match a contents page's line with the chapter it lists. */
const headingKey = (heading: string) => heading.replace(/\s+/g, " ").trim().toLowerCase()

const LEADER = /[\s.·…_]/u

/**
 * A contents page's line without its page number: "chapter 1 ....... 3" as "chapter 1". Read back from the end,
 * as a regular expression would try every start along a long run of dots.
 */
function withoutPage(key: string): string {
  let end = key.length
  while (end > 0 && key[end - 1] >= "0" && key[end - 1] <= "9") end--
  const digits = end
  while (end > 0 && LEADER.test(key[end - 1])) end--
  return digits === key.length || end === digits ? key : key.slice(0, end)
}

interface Split {
  chapter: DraftChapter
  /** Made of front matter, not by a chapter's heading. */
  front: boolean
}

function split(pieces: readonly Piece[], titleIndex: number | null, settings: SplitSettings): Split[] {
  const built = buildChapters(pieces, titleIndex, settings).map((draft) => {
    const scenes: DraftScene[] = draft.scenes
      .map((scene) => {
        const blocks = tidyBlocks(scene.blocks)
        return { title: scene.title, blocks, words: countWords(blocksText(blocks)) }
      })
      .filter((scene) => scene.title || scene.blocks.length > 0)
    return { draft, scenes, keys: [headingKey(draft.heading), draft.title.toLowerCase()].filter(Boolean) }
  })
  // Where each heading and title last heads a chapter with something in it.
  const lastWritten = new Map<string, number>()
  built.forEach(({ scenes, keys }, index) => {
    if (scenes.length > 0) for (const key of keys) lastWritten.set(key, index)
  })
  const hasChapters = built.some(({ draft }) => !draft.front)

  const chapters: Split[] = []
  let carried: string | null = null
  built.forEach(({ draft, scenes, keys }, index) => {
    const act = draft.act ?? carried
    carried = null
    // Nothing but space before a chapter, or a contents page's line for a chapter further on: an act it starts passes on.
    const listed = () => keys.some((key) => [key, withoutPage(key)].some((line) => (lastWritten.get(line) ?? -1) > index))
    if (scenes.length === 0 && (draft.front || listed())) {
      carried = act
      return
    }
    const words = scenes.reduce((sum, scene) => sum + scene.words, 0)
    const leftOut = draft.front && chapters.length === 0 && hasChapters && words < FRONT_MATTER_WORDS
    chapters.push({ chapter: { key: `chapter-${index + 1}`, title: draft.title, scenes, act, leftOut }, front: draft.front })
  })
  return chapters
}

/** The chapters the settings make of the pieces. */
export function splitManuscript(pieces: readonly Piece[], titleIndex: number | null, settings: SplitSettings): Outline {
  return split(pieces, titleIndex, settings).map(({ chapter }) => chapter)
}

/** The heading that titles the book: Word's Title, used once, first; or else a lone heading over the rest, first. */
function findTitle(pieces: readonly Piece[]): number | null {
  const headings = pieces.flatMap((piece, index) =>
    piece.type === "heading" && !isContentsHeading(piece) ? [{ piece, index }] : [],
  )
  const first = headings[0]
  const opening = pieces.findIndex((piece) => piece.type === "heading" || piece.block.type !== "break")
  if (!first) return null
  const lines = headingLines(first.piece.inlines)
  const chapterLike = (lines: readonly string[]) =>
    isPartHeading(lines) || chapterHeading(lines) !== null || bareHeading(lines) !== null
  if (chapterLike(lines)) return null
  if (first.piece.level === 0 && headings.filter(({ piece }) => piece.level === 0).length === 1) return first.index
  if (first.index !== opening) return null
  const peers = headings.filter(({ piece, index }) => index !== first.index && piece.level <= first.piece.level)
  if (peers.length === 0) return first.index
  // "# The Book" over "# Chapter 1", "# Chapter 2"…, with no more than a title page's words between.
  const between = pieces
    .slice(first.index + 1, peers[0].index)
    .reduce((sum, piece) => sum + (piece.type === "block" ? countWords(blocksText([piece.block])) : 0), 0)
  return between < 100 && peers.every(({ piece }) => chapterLike(headingLines(piece.inlines))) ? first.index : null
}

/** The level chapter headings are likeliest at: the first that says "Chapter 3", or else the first with any titles. */
function likelyLevel(pieces: readonly Piece[], titleIndex: number | null, levels: readonly number[]): number | null {
  const labelled = new Set<number>()
  const titled = new Set<number>()
  const unnumbered = new Set<number>()
  pieces.forEach((piece, index) => {
    if (piece.type !== "heading" || index === titleIndex || isContentsHeading(piece)) return
    const lines = headingLines(piece.inlines)
    if (isPartHeading(lines)) return
    if (isChapterLabel(lines)) labelled.add(piece.level)
    else if (chapterHeading(lines)) unnumbered.add(piece.level)
    else titled.add(piece.level)
  })
  return (
    levels.find((level) => labelled.has(level)) ??
    levels.find((level) => titled.has(level)) ??
    levels.find((level) => unnumbered.has(level)) ??
    null
  )
}

/** The ways the manuscript could be split, and the likeliest. */
export function analyzeManuscript(pieces: readonly Piece[]): Analysis {
  const titleIndex = findTitle(pieces)
  const levels = levelsOf(pieces, titleIndex)
  const count = (mode: SplitMode) =>
    split(pieces, titleIndex, { mode, scenes: true }).filter(({ front }) => !front).length
  const choices: SplitChoice[] = []
  for (const level of levels) {
    const chapters = count({ kind: "headings", level })
    if (chapters > 0) choices.push({ mode: { kind: "headings", level }, chapters })
  }
  const lines = count({ kind: "lines" })
  if (lines > 0) choices.push({ mode: { kind: "lines" }, chapters: lines })
  choices.push({ mode: { kind: "none" }, chapters: 1 })

  const level = likelyLevel(pieces, titleIndex, levels)
  const byHeadings = choices.find((choice) => choice.mode.kind === "headings" && choice.mode.level === level)
  let mode: SplitMode
  if (lines >= 2 && (!byHeadings || lines > 2 * byHeadings.chapters)) mode = { kind: "lines" }
  else if (byHeadings) mode = byHeadings.mode
  else if (lines > 0) mode = { kind: "lines" }
  else mode = { kind: "none" }
  return { titleIndex, choices, settings: { mode, scenes: true } }
}

/** The book's title and author as the manuscript gives them, if it does: its title heading, or a title page's "by" line. */
export function suggestDetails(
  pieces: readonly Piece[],
  analysis: Analysis,
  settings: SplitSettings,
): { title: string; author: string } {
  const heading = analysis.titleIndex === null ? null : pieces[analysis.titleIndex]
  const title = heading?.type === "heading" ? headingLines(heading.inlines).join(" ") : ""
  const roles = rolesOf(pieces, analysis.titleIndex, settings)
  const firstChapter = roles.findIndex((role) => role.role === "chapter")
  const front = pieces.slice(0, firstChapter === -1 ? 12 : Math.min(firstChapter, 40))
  const paragraphs = front.map((piece) =>
    piece.type === "block" && piece.block.type === "paragraph" ? headingLines(piece.block.inlines).join(" ") : "",
  )
  const byline = paragraphs.findIndex((text) => text.length <= 120 && countWords(text) <= 8 && BYLINE.test(text))
  const author = byline === -1 ? "" : paragraphs[byline].replace(/^by\s+/i, "")
  const before = byline > 0 ? paragraphs[byline - 1] : ""
  return { title: tidyTitle(title || (countWords(before) <= 12 ? before : "")), author }
}
