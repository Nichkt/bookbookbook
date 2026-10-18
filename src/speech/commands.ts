/*
 * Voice commands (DESIGN.md §10): what a dictated phrase means. "Period" types a full stop, "new paragraph" starts
 * one, "scratch that" takes back what was said last, and "literal" before a command types its words instead.
 */

export type Mark = "." | "," | "?" | "!" | ":" | ";" | "“" | "”"

export type Step =
  | { kind: "words"; text: string }
  | { kind: "mark"; mark: Mark }
  | { kind: "break"; paragraph: boolean }
  /** Takes back the last piece of dictation. */
  | { kind: "scratch" }
  | { kind: "stop" }

/** The commands as the dictation settings list them. */
export const COMMAND_HELP: readonly { say: string; does: string }[] = [
  { say: "period, comma, question mark, exclamation mark, colon, semicolon", does: "Types the mark." },
  { say: "open quote, close quote", does: "Types “ or ”." },
  { say: "new line, new paragraph", does: "Starts one." },
  { say: "new moment", does: "In a note, starts a new line: each line is a moment if you file the note as moments." },
  { say: "scratch that", does: "Takes back what you said last." },
  { say: "literal, then a command", does: "Types the command's words instead: “literal comma” types “comma”." },
  { say: "stop listening", does: "Stops dictation." },
]

export interface CommandOptions {
  /** Off, everything said is typed as it's heard. */
  commands: boolean
  /** "New moment" (or "new beat") starts a new line: in a note, which can be filed as one moment per line. */
  moments?: boolean
}

const mark = (value: Mark): Step => ({ kind: "mark", mark: value })
const LINE: Step = { kind: "break", paragraph: false }

/** Every phrase, as words, and what it does. Some have two names, as dictation apps differ. */
const COMMANDS: readonly (readonly [phrase: readonly string[], step: Step, momentsOnly?: true])[] = [
  [["new", "paragraph"], { kind: "break", paragraph: true }],
  [["new", "line"], LINE],
  [["new", "moment"], LINE, true],
  [["new", "beat"], LINE, true],
  [["scratch", "that"], { kind: "scratch" }],
  [["stop", "listening"], { kind: "stop" }],
  [["period"], mark(".")],
  [["full", "stop"], mark(".")],
  [["comma"], mark(",")],
  [["question", "mark"], mark("?")],
  [["exclamation", "mark"], mark("!")],
  [["exclamation", "point"], mark("!")],
  [["colon"], mark(":")],
  [["semicolon"], mark(";")],
  [["open", "quote"], mark("“")],
  [["close", "quote"], mark("”")],
  [["end", "quote"], mark("”")],
  [["unquote"], mark("”")],
]

/** The word as a command would be: lower case, without the punctuation an engine may put around it. */
const bare = (word: string) => word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")

/** The command whose words start at `index`, the longest if two match, and how many words it takes. */
function commandAt(words: readonly string[], index: number, options: CommandOptions) {
  let found: { step: Step; length: number } | null = null
  for (const [phrase, step, momentsOnly] of COMMANDS) {
    if (momentsOnly && !options.moments) continue
    if (found && found.length >= phrase.length) continue
    const matches = phrase.every((word, offset) => bare(words[index + offset] ?? "") === word)
    if (matches) found = { step, length: phrase.length }
  }
  return found
}

/**
 * What a final piece of dictation says to do, in order. "Scratch that" takes back what was said before it in the
 * same piece; said first, it stays, to take back the piece before.
 */
export function parseSpeech(transcript: string, options: CommandOptions): Step[] {
  const words = transcript.split(/\s+/u).filter(Boolean)
  if (!options.commands) return words.length ? [{ kind: "words", text: words.join(" ") }] : []
  const steps: Step[] = []
  /** Where the steps since the last "scratch that" begin: those it can take back. */
  let since = 0
  let run: string[] = []
  const endRun = () => {
    if (run.length) steps.push({ kind: "words", text: run.join(" ") })
    run = []
  }
  for (let index = 0; index < words.length; ) {
    if (bare(words[index]) === "literal" && index + 1 < words.length) {
      const length = commandAt(words, index + 1, options)?.length
      run.push(...(length ? words.slice(index + 1, index + 1 + length).map(bare) : [words[index + 1]]))
      index += 1 + (length ?? 1)
      continue
    }
    const command = commandAt(words, index, options)
    if (!command) {
      run.push(words[index])
      index++
      continue
    }
    endRun()
    index += command.length
    if (command.step.kind === "scratch") {
      if (steps.length > since) steps.length = since
      else since = steps.push(command.step)
      continue
    }
    steps.push(command.step)
    if (command.step.kind === "stop") return steps
  }
  endRun()
  return steps
}

/** What the next words follow without a space. */
const OPENING = /[“‘([{¿¡—–]$/u
/** A straight quote that opens: at the start, or after a space. */
const STRAIGHT_OPENING = /(?:^|\s)["']$/u
/** Where a sentence starts: nothing before it, the end of one, or an opening double quote. */
const SENTENCE_START = /(?:^\s*|[.?!…]["”’)\]]*\s*|(?:^|\s)[“"])$/u

const capitalize = (text: string) => text.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase())

/** Whether what's typed after `before` needs a space first. */
const needsSpace = (before: string) =>
  before !== "" && !/\s$/u.test(before) && !OPENING.test(before) && !STRAIGHT_OPENING.test(before)

/**
 * The text to type for words or a mark after `before`, the text before the caret: a space where one's needed, and a
 * capital letter to start a sentence or a line.
 */
export function spaced(before: string, step: Extract<Step, { kind: "words" | "mark" }>): string {
  const line = before.slice(before.lastIndexOf("\n") + 1)
  if (step.kind === "mark") return step.mark === "“" && needsSpace(line) ? " “" : step.mark
  const text = step.text.trim()
  if (!text) return ""
  return `${needsSpace(line) ? " " : ""}${SENTENCE_START.test(line) ? capitalize(text) : text}`
}

/** A piece of dictation as plain text, after `before`: line breaks for breaks. For a note, or a box like one. */
export function plainText(before: string, steps: readonly Step[]): string {
  let text = ""
  for (const step of steps) {
    if (step.kind === "words" || step.kind === "mark") text += spaced(before + text, step)
    else if (step.kind === "break") text += step.paragraph ? "\n\n" : "\n"
  }
  return text
}
