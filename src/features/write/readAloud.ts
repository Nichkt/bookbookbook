import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { create } from "zustand"
import { announce } from "@/app/feedback"
import { activeEditor, editorOf, useEditors, whenEditor, type MountedEditor } from "@/editor/activeEditor"
import { readingRange, showReading, type ReadingRange } from "@/editor/extensions/ReadAloud"
import type { Plan } from "@/features/plan/planData"
import { byData } from "@/lib/focus"
import { stopDictation } from "@/speech/dictation"
import { setReadAloudStop } from "./readAloudStop"
import { chapterOfScene, type WriteUnit } from "./writeContext"

/*
 * Read aloud (DESIGN.md §8 "Writing aids"): the device's own voices speak the text a sentence at a time, each marked
 * as it's spoken and kept in view. It starts at the caret's sentence and goes on through the scenes the view shows,
 * or reads just the selection. Typing, Esc or Stop ends it; Esc and Stop leave the caret at the sentence it was on,
 * ready to fix what was heard.
 */

export type ReadingStatus = "idle" | "playing" | "paused"

export const useReadAloud = create<{ status: ReadingStatus }>(() => ({ status: "idle" }))

/** Per device, like typewriter scrolling: the voice's URI, and the speed. */
export const READ_ALOUD_VOICE_PREF = "write.readAloud.voice"
export const READ_ALOUD_RATE_PREF = "write.readAloud.rate"
export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const
export const parseRate = (value: string | null) => RATES.find((rate) => String(rate) === value) ?? 1

/** The reading bar, which the sentence being read is kept above. */
export const READ_ALOUD_BAR = "[data-read-aloud-bar]"
/** Its play and pause button, which takes focus as reading starts. */
export const READ_ALOUD_PLAY = "[data-read-aloud-play]"

export const canReadAloud = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function"

// Sentences

export interface Sentence {
  from: number
  to: number
}

interface Segment {
  segment: string
  index: number
}

/** Where Intl.Segmenter is missing: a sentence ends at . ! ? or …, and any closing quotes or brackets after. */
export function* splitSentences(text: string): Generator<Segment> {
  let start = 0
  for (const match of text.matchAll(/[.!?…]+["'”’)\]]*\s+/gu)) {
    const end = match.index + match[0].length
    yield { segment: text.slice(start, end), index: start }
    start = end
  }
  if (start < text.length) yield { segment: text.slice(start), index: start }
}

let segmenter: Intl.Segmenter | null | undefined
function segment(text: string): Iterable<Segment> {
  segmenter ??= "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : null
  return segmenter ? segmenter.segment(text) : splitSentences(text)
}

const OBJECT = "\uFFFC"
const SPEAKABLE = /[\p{L}\p{N}]/u

/**
 * A doc's sentences, each within one block and without the spaces around it. A line break ends one too, as in
 * verse or a letter's address. Blocks with no words have none.
 */
export function sentencesIn(doc: ProseMirrorNode, split: (text: string) => Iterable<Segment> = segment): Sentence[] {
  const sentences: Sentence[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ""
    node.forEach((child) => {
      if (child.isText) text += child.text!
      else if (child.type.name === "hardBreak") text += "\n"
      else text += OBJECT.repeat(child.nodeSize)
    })
    for (const line of text.split("\n").reduce<Segment[]>(linesOf, [])) {
      for (const { segment: piece, index } of split(line.segment)) {
        const body = piece.trim()
        if (!SPEAKABLE.test(body)) continue
        const from = pos + 1 + line.index + index + piece.length - piece.trimStart().length
        sentences.push({ from, to: from + body.length })
      }
    }
    return false
  })
  return sentences
}

/** For reducing a block's text split at its line breaks to the lines and where each starts. */
function linesOf(lines: Segment[], line: string): Segment[] {
  const last = lines.at(-1)
  lines.push({ segment: line, index: last ? last.index + last.segment.length + 1 : 0 })
  return lines
}

const cache = new WeakMap<ProseMirrorNode, Sentence[]>()
function sentencesOf(doc: ProseMirrorNode): Sentence[] {
  let sentences = cache.get(doc)
  if (!sentences) {
    sentences = sentencesIn(doc)
    cache.set(doc, sentences)
  }
  return sentences
}

/** Where reading from the caret starts: the sentence it's in, or the next. After the last, the first. */
export function sentenceAt(sentences: readonly Sentence[], pos: number): ReadingRange | null {
  const sentence = sentences.find((candidate) => candidate.to >= pos) ?? sentences[0]
  return sentence ? { from: sentence.from, to: sentence.to } : null
}

/** The sentence after `after`, or the rest of the one it's in, cut to `bounds` when reading a selection. */
export function nextSentence(
  sentences: readonly Sentence[],
  after: number,
  bounds: ReadingRange | null,
): ReadingRange | null {
  const end = bounds?.to ?? Infinity
  const sentence = sentences.find((candidate) => candidate.to > after && Math.max(candidate.from, after) < end)
  if (!sentence) return null
  return { from: Math.max(sentence.from, after), to: Math.min(sentence.to, end) }
}

/** The sentence before `before`, within `bounds` when reading a selection. */
export function previousSentence(
  sentences: readonly Sentence[],
  before: number,
  bounds: ReadingRange | null,
): ReadingRange | null {
  const start = bounds?.from ?? 0
  const sentence = sentences.findLast(
    (candidate) => candidate.from < before && Math.min(candidate.to, before) > Math.max(candidate.from, start),
  )
  if (!sentence) return null
  return { from: Math.max(sentence.from, start), to: Math.min(sentence.to, before) }
}

/** The scene reading goes on to in the view shown: the chapter's next, then in the Manuscript the book's. */
export function sceneAfter(plan: Plan, unit: WriteUnit, sceneId: string): string | null {
  const chapter = unit === "scene" ? undefined : chapterOfScene(plan, sceneId)
  if (!chapter) return null
  const index = chapter.scenes.findIndex((scene) => scene.id === sceneId)
  if (index < chapter.scenes.length - 1) return chapter.scenes[index + 1].id
  if (unit === "chapter") return null
  const later = plan.chapters.slice(plan.chapters.indexOf(chapter) + 1)
  return later.find((next) => next.scenes.length > 0)?.scenes[0].id ?? null
}

// Voices

export type VoiceInfo = Pick<SpeechSynthesisVoice, "voiceURI" | "name" | "lang" | "localService" | "default">

const languageOf = (lang: string) => lang.toLowerCase().split(/[-_]/)[0]
const sameLang = (a: string, b: string) => a.toLowerCase().replace("_", "-") === b.toLowerCase().replace("_", "-")

/** The language read in: the browser's. */
export const readingLanguage = () => navigator.language || document.documentElement.lang || "en"

/**
 * The voice to read with: the one chosen, while the device has it. Else one for the language, preferring voices
 * that run on the device to online ones, which send the text away to be spoken, then the device's default, then
 * the language's own region.
 */
export function pickVoice<T extends VoiceInfo>(voices: readonly T[], chosen: string | null, lang: string): T | null {
  const picked = chosen ? voices.find((voice) => voice.voiceURI === chosen) : undefined
  if (picked) return picked
  const inLanguage = voices.filter((voice) => languageOf(voice.lang) === languageOf(lang))
  const rank = (voice: T) =>
    (voice.localService ? 0 : 4) + (voice.default ? 0 : 2) + (sameLang(voice.lang, lang) ? 0 : 1)
  return (inLanguage.length ? inLanguage : voices).reduce<T | null>(
    (best, voice) => (best === null || rank(voice) < rank(best) ? voice : best),
    null,
  )
}

/** The voices offered: the language's, by name, with the one in use even if it isn't. All of them if none are. */
export function voiceChoices<T extends VoiceInfo>(voices: readonly T[], current: T | null, lang: string): T[] {
  const inLanguage = voices.filter((voice) => languageOf(voice.lang) === languageOf(lang) || voice === current)
  return [...(inLanguage.length ? inLanguage : voices)].sort((a, b) => a.name.localeCompare(b.name))
}

/** A voice's name without the language most add, as in "Microsoft David - English (United States)". */
const shortName = (name: string) => name.replace(/\s+-\s+[^-]+$/, "")

/**
 * The names to show for the voices offered, by voice URI: without the language, which they share, unless that
 * leaves two the same. Online voices are marked, as they send the text away to be spoken.
 */
export function voiceLabels(choices: readonly VoiceInfo[]): Map<string, string> {
  const uses = new Map<string, number>()
  for (const voice of choices) uses.set(shortName(voice.name), (uses.get(shortName(voice.name)) ?? 0) + 1)
  return new Map(
    choices.map((voice) => {
      const name = uses.get(shortName(voice.name)) === 1 ? shortName(voice.name) : voice.name
      return [voice.voiceURI, voice.localService ? name : `${name} (online)`]
    }),
  )
}

/** The device's voices, which some browsers only list a moment after the page loads. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => (canReadAloud() ? speechSynthesis.getVoices() : []))
  useEffect(() => {
    if (!canReadAloud()) return
    const update = () => setVoices(speechSynthesis.getVoices())
    update()
    speechSynthesis.addEventListener("voiceschanged", update)
    return () => speechSynthesis.removeEventListener("voiceschanged", update)
  }, [])
  return voices
}

// Reading

interface Reading {
  editor: Editor
  sceneId: string
  /** The selection being read, when it's just that. */
  bounds: ReadingRange | null
}

/** How long a sentence may take to start before the voice is taken to have failed. */
const START_MS = 8000
/** How long to wait for the next scene's text to load. */
const NEXT_SCENE_MS = 5000
const MARGIN = 24
/** The reading bar's height, for room before it's on the page. */
const BAR_HEIGHT = 48

let reading: Reading | null = null
/** Bumped whenever speech is cut off, so the events of what was cut off are ignored. */
let generation = 0
/** Held so it can't be collected mid-sentence, which in Chrome loses its end event. */
let utterance: SpeechSynthesisUtterance | null = null
/** When speech was last cancelled: Chrome can drop an utterance queued just after. */
let cancelledAt = -Infinity
const AFTER_CANCEL_MS = 50
let watchdog = 0
let stopWaiting: (() => void) | null = null
let voice: SpeechSynthesisVoice | null = null
let rate = 1
let sceneAfterOf: (sceneId: string) => string | null = () => null

/** What comes after a scene in the view the page shows. */
export function setReadingOrder(next: (sceneId: string) => string | null) {
  sceneAfterOf = next
}

/** The voice and speed to read with. A change is heard from the start of the sentence being read. */
export function setReadingVoice(nextVoice: SpeechSynthesisVoice | null, nextRate: number) {
  const changed = nextVoice?.voiceURI !== voice?.voiceURI || nextRate !== rate
  voice = nextVoice
  rate = nextRate
  if (changed && useReadAloud.getState().status === "playing") speak()
}

/**
 * Starts reading in the editor the writer is in, or the one filling the window: the selection, else from the
 * caret's sentence on. Returns whether there was anything to read.
 */
export function startReading(): boolean {
  if (!canReadAloud()) return false
  const entry = activeEditor()
  const start = entry && !entry.editor.isDestroyed ? startIn(entry.editor) : null
  if (!entry || !start) {
    toast("There's nothing here to read aloud yet.")
    return false
  }
  end()
  // The microphone would hear it.
  stopDictation()
  reading = { editor: entry.editor, sceneId: entry.sceneId, bounds: start.bounds }
  useReadAloud.setState({ status: "playing" })
  moveTo(entry.editor, start.first)
  return true
}

/** The first sentence to read in an editor, and the selection when it's only that. */
function startIn(editor: Editor) {
  const { empty, from, to } = editor.state.selection
  const sentences = sentencesOf(editor.state.doc)
  const bounds = empty ? null : { from, to }
  const first = bounds ? nextSentence(sentences, from, bounds) : sentenceAt(sentences, from)
  return first && { first, bounds }
}

export function pauseReading() {
  if (!reading) return
  silence()
  useReadAloud.setState({ status: "paused" })
}

/** Carries on from the start of the sentence it was paused in. */
export function resumeReading() {
  if (!reading) return
  useReadAloud.setState({ status: "playing" })
  speak()
}

/** Goes on to the next sentence, or back to the one before (or the start of this one, at the scene's first). */
export function skipSentence(direction: 1 | -1) {
  const current = reading
  const range = current && !current.editor.isDestroyed ? readingRange(current.editor.state) : null
  if (!current || !range) return
  silence()
  if (direction === 1) return next()
  const sentences = sentencesOf(current.editor.state.doc)
  moveTo(current.editor, previousSentence(sentences, range.from, current.bounds) ?? range)
}

/**
 * Stops reading; returns whether it was. With `toText`, as for Esc or Stop, the caret goes to the start of the
 * sentence it stopped in. So does focus in the reading bar, which goes with it.
 */
export function stopReading(toText = false): boolean {
  const current = reading
  if (!current) return false
  const range = current.editor.isDestroyed ? null : readingRange(current.editor.state)
  const inBar = !!document.activeElement?.closest(READ_ALOUD_BAR)
  end()
  announce("Stopped reading")
  if (range && (toText || inBar)) placeCaret(current.editor, range.from)
  return true
}

setReadAloudStop(() => stopReading())

/** Stops reading once the editor it's in has left the page, unless it's on its way to the next scene's. */
export function stopIfGone() {
  if (reading && !stopWaiting && !useEditors.getState().mounted.some((entry) => entry.editor === reading?.editor)) {
    stopReading()
  }
}

function moveTo(editor: Editor, range: ReadingRange) {
  showReading(editor, range)
  keepInView(editor, range)
  if (useReadAloud.getState().status === "playing") speak()
}

/** Speaks the sentence marked, from its start. */
function speak() {
  silence()
  const current = reading
  const range = current && !current.editor.isDestroyed ? readingRange(current.editor.state) : null
  if (!current || !range) return void end()
  const id = generation
  const say = () => {
    if (id !== generation) return
    const spoken = new SpeechSynthesisUtterance(current.editor.state.doc.textBetween(range.from, range.to, " ", " "))
    spoken.rate = rate
    if (voice) {
      spoken.voice = voice
      spoken.lang = voice.lang
    }
    spoken.onstart = () => window.clearTimeout(watchdog)
    spoken.onend = () => {
      if (id === generation) next()
    }
    spoken.onerror = (event) => {
      if (id === generation && event.error !== "interrupted" && event.error !== "canceled") fail()
    }
    utterance = spoken
    watchdog = window.setTimeout(() => id === generation && fail(), START_MS)
    speechSynthesis.speak(spoken)
  }
  const wait = cancelledAt + AFTER_CANCEL_MS - performance.now()
  if (wait > 0) window.setTimeout(say, wait)
  else say()
}

/** Cuts off whatever is being said. */
function silence() {
  generation++
  window.clearTimeout(watchdog)
  if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null
  utterance = null
  if (!canReadAloud() || !(speechSynthesis.speaking || speechSynthesis.pending)) return
  speechSynthesis.cancel()
  cancelledAt = performance.now()
}

/** On from the sentence just read: to the next in the scene, else to the next scene the page shows. */
function next() {
  const current = reading
  if (!current) return
  const range = current.editor.isDestroyed ? null : readingRange(current.editor.state)
  const following = range && nextSentence(sentencesOf(current.editor.state.doc), range.to, current.bounds)
  if (following) moveTo(current.editor, following)
  else if (current.bounds) finish()
  else continueAfter(current.sceneId)
}

function continueAfter(sceneId: string) {
  const nextId = sceneAfterOf(sceneId)
  const section = nextId && document.querySelector<HTMLElement>(byData("scene-id", nextId))
  if (!nextId || !section) return finish()
  const id = generation
  let timer = 0
  const arrive = ({ editor }: MountedEditor) => {
    window.clearTimeout(timer)
    stopWaiting = null
    if (id !== generation || !reading) return
    showReading(reading.editor, null)
    reading = { editor, sceneId: nextId, bounds: null }
    const first = nextSentence(sentencesOf(editor.state.doc), 0, null)
    if (first) moveTo(editor, first)
    else continueAfter(nextId)
  }
  const loaded = editorOf(nextId)
  if (loaded) return arrive(loaded)
  // In the Manuscript a scene's text loads as it nears the window.
  section.scrollIntoView({ block: "start", behavior: reducedMotion() ? "instant" : "smooth" })
  stopWaiting = whenEditor(nextId, arrive)
  timer = window.setTimeout(() => {
    stopWaiting?.()
    stopWaiting = null
    if (id === generation) finish()
  }, NEXT_SCENE_MS)
}

/** Read to the end. Focus in the reading bar goes back to the text, after the last sentence. */
function finish() {
  const current = reading
  const range = current && !current.editor.isDestroyed ? readingRange(current.editor.state) : null
  const inBar = !!document.activeElement?.closest(READ_ALOUD_BAR)
  end()
  announce("Finished reading")
  if (current && range && inBar) placeCaret(current.editor, range.to)
}

function fail() {
  end()
  toast.error("Read aloud stopped, as the browser couldn't speak. Check that the device has a voice installed.")
}

function end() {
  silence()
  stopWaiting?.()
  stopWaiting = null
  if (reading && !reading.editor.isDestroyed) showReading(reading.editor, null)
  reading = null
  if (useReadAloud.getState().status !== "idle") useReadAloud.setState({ status: "idle" })
}

function placeCaret(editor: Editor, pos: number) {
  if (editor.isDestroyed) return
  editor.chain().setTextSelection(pos).run()
  editor.view.focus()
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Scrolls a sentence out of sight to a third of the way down the text's part of the window. */
function keepInView(editor: Editor, range: ReadingRange) {
  const top = (document.querySelector("[data-write-toolbar]")?.getBoundingClientRect().bottom ?? 0) + MARGIN
  const bottom = barTop() - MARGIN
  const start = editor.view.coordsAtPos(range.from, 1)
  const last = editor.view.coordsAtPos(range.to, -1)
  if (start.top >= top && last.bottom <= bottom) return
  const delta = start.top - (top + (bottom - top) / 3)
  window.scrollBy({ top: delta, behavior: reducedMotion() ? "instant" : "smooth" })
}

/** The top of the reading bar, or where it will be before it's on the page: above the toasts' offset. */
function barTop(): number {
  const bar = document.querySelector(READ_ALOUD_BAR)
  if (bar) return bar.getBoundingClientRect().top
  const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--toast-bottom"))
  return window.innerHeight - (Number.isFinite(offset) ? offset : 0) - BAR_HEIGHT
}
