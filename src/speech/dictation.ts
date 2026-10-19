import { toast } from "sonner"
import { create } from "zustand"
import { desktop } from "@/app/desktop"
import { announce, reportError } from "@/app/feedback"
import { parseSpeech, type Step } from "./commands"
import {
  commandsWork,
  recognitionConstructor,
  type EngineKind,
  type Recognition,
  type RecognitionConstructor,
  type RecognitionResultEvent,
} from "./engine"

/*
 * Live dictation (DESIGN.md §10 "Capture modes"): one session at a time, typing into the box that started it. What's
 * still being heard shows in the Listening pill; each settled piece goes in at the caret, voice commands and all.
 * Browsers stop listening after a silence, so it starts again until the writer stops it.
 */

export interface DictationTarget {
  /** The box dictated into: its Dictate button shows pressed while it's listening. */
  id: string
  /** Where the words go, as the Listening pill puts it: "your note". */
  label: string
  /** "New moment" starts a new line. */
  moments?: boolean
  /** Whether the box is still there to dictate into, as it may have gone while dictation was being set up. */
  alive?(): boolean
  /** Puts a settled piece in at the caret. Any "scratch that"s come first, each taking back the piece before. */
  insert(steps: readonly Step[]): void
}

export interface DictationOptions {
  engine: EngineKind
  lang: string
  /** Voice commands, if the writer has them on: they only work in English. */
  commands: boolean
}

export type DictationStatus = "idle" | "starting" | "listening" | "stopping"

interface DictationState {
  status: DictationStatus
  /** The box being dictated into. */
  targetId: string | null
  label: string
  engine: EngineKind | null
  /** What's being heard and hasn't settled yet: shown, not typed. */
  interim: string
}

const IDLE: DictationState = { status: "idle", targetId: null, label: "", engine: null, interim: "" }

export const useDictation = create<DictationState>(() => IDLE)

const listening = (state: DictationState, targetId: string) =>
  state.targetId === targetId && (state.status === "starting" || state.status === "listening")

/** Whether a box is being dictated into, which its Dictate button shows by being pressed. */
export const useDictatingInto = (targetId: string) => useDictation((state) => listening(state, targetId))

export const isDictatingInto = (targetId: string) => listening(useDictation.getState(), targetId)

/** Ends that come this soon after starting, having heard nothing, count toward giving up. */
const QUICK_END_MS = 1500
const MAX_QUICK_ENDS = 3
/** How long to wait for the browser to finish after Stop before ending regardless. */
const STOP_WAIT_MS = 4000

interface Session {
  target: DictationTarget
  options: DictationOptions
  Recognition: RecognitionConstructor
  recognition: Recognition | null
  /** The final results already typed, by index: each recognizer numbers its own. */
  typed: Set<number>
  /** False once the writer stops it, or it fails: then an end is the end, not a pause to start again after. */
  wanted: boolean
  /** Why it failed, to tell the writer. */
  failure: string | null
  startedAt: number
  heard: boolean
  quickEnds: number
  stopTimer: ReturnType<typeof setTimeout> | undefined
}

let session: Session | null = null

export function failureMessage(error: string, engine: EngineKind): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      // The desktop app allows the microphone itself (src-tauri/src/lib.rs), so only Windows says no.
      return desktop
        ? "Windows won't let bookbookbook use the microphone. Open Settings, search for “microphone privacy”, and " +
          "let desktop apps use it. Then try again."
        : "The browser won't let bookbookbook use the microphone. Allow it in the site's settings, by the address " +
          "bar, then try again."
    case "audio-capture":
      return "No microphone was found. Check that one is plugged in and not in use by another app."
    case "network":
      if (engine !== "online") return "Dictation lost its connection. Try again."
      // WebView2 can't recognize speech on the device, so there's no dictating there instead.
      return desktop
        ? "Online dictation couldn't reach Microsoft's speech service. Check your connection and try again, or " +
          "press Windows key + H to dictate with Windows itself."
        : "Online dictation needs the internet. Check your connection, or set dictation up on this device."
    case "language-not-supported":
      return "Dictation can't do that language here. Choose another in Dictation settings."
    default:
      return "Dictation stopped unexpectedly. Try again."
  }
}

/**
 * Starts dictating into `target`, ending any other dictation first. Returns false if the browser has no speech
 * recognition, or the box has gone.
 */
export function startDictation(
  target: DictationTarget,
  options: DictationOptions,
  Recognition: RecognitionConstructor | null = recognitionConstructor(),
): boolean {
  if (!Recognition || target.alive?.() === false) return false
  if (session) finish(session, { quietly: true, abort: true })
  const mine: Session = {
    target,
    options: { ...options, commands: options.commands && commandsWork(options.lang) },
    Recognition,
    recognition: null,
    typed: new Set(),
    wanted: true,
    failure: null,
    startedAt: 0,
    heard: false,
    quickEnds: 0,
    stopTimer: undefined,
  }
  session = mine
  useDictation.setState({
    status: "starting",
    targetId: target.id,
    label: target.label,
    engine: options.engine,
    interim: "",
  })
  listen(mine)
  return true
}

/** Stops listening once what's been heard has settled and gone in. */
export function stopDictation() {
  const mine = session
  if (!mine || !mine.wanted) return
  mine.wanted = false
  useDictation.setState({ status: "stopping" })
  mine.stopTimer = setTimeout(() => finish(mine, { abort: true }), STOP_WAIT_MS)
  try {
    mine.recognition?.stop()
  } catch {
    finish(mine, { abort: true })
  }
}

/** Ends dictation into a box at once, dropping anything unsettled: for a box that's going away. */
export function cancelDictation(targetId: string) {
  if (session?.target.id === targetId) finish(session, { abort: true })
}

function listen(mine: Session) {
  let recognition: Recognition
  try {
    recognition = new mine.Recognition()
    recognition.lang = mine.options.lang
    recognition.continuous = true
    recognition.interimResults = true
    if (mine.options.engine === "on-device") recognition.processLocally = true
  } catch (error) {
    console.error("[dictation]", error)
    mine.failure = failureMessage("", mine.options.engine)
    finish(mine)
    return
  }
  mine.recognition = recognition
  mine.typed = new Set()
  mine.startedAt = Date.now()
  mine.heard = false
  recognition.onstart = () => {
    if (session === mine) began()
  }
  recognition.onresult = (event) => {
    if (session === mine) heard(mine, event)
  }
  recognition.onerror = ({ error }) => {
    if (session !== mine) return
    // Silence ends a session, and so does stopping one: neither is a failure.
    if (error === "no-speech" || error === "aborted") return
    mine.failure = failureMessage(error, mine.options.engine)
    mine.wanted = false
  }
  recognition.onend = () => {
    if (session === mine) ended(mine)
  }
  try {
    recognition.start()
  } catch (error) {
    console.error("[dictation]", error)
    mine.failure = failureMessage("", mine.options.engine)
    finish(mine, { abort: true })
  }
}

function began() {
  if (useDictation.getState().status !== "starting") return
  useDictation.setState({ status: "listening" })
  announce("Listening")
}

function heard(mine: Session, event: RecognitionResultEvent) {
  mine.heard = true
  mine.quickEnds = 0
  began()
  let settled = ""
  let interim = ""
  for (let index = event.resultIndex; index < event.results.length; index++) {
    const result = event.results[index]
    const transcript = result[0]?.transcript ?? ""
    if (!result.isFinal) interim += transcript
    else if (!mine.typed.has(index)) {
      mine.typed.add(index)
      settled += ` ${transcript}`
    }
  }
  useDictation.setState({ interim: interim.trim() })
  if (!settled.trim()) return
  const steps = parseSpeech(settled, { commands: mine.options.commands, moments: mine.target.moments })
  const stop = steps.findIndex((step) => step.kind === "stop")
  const typed = stop < 0 ? steps : steps.slice(0, stop)
  try {
    if (typed.length) mine.target.insert(typed)
  } catch (error) {
    reportError("dictation", error)
    finish(mine, { abort: true, quietly: true })
    return
  }
  if (stop >= 0) stopDictation()
}

function ended(mine: Session) {
  if (mine.wanted) {
    const quick = !mine.heard && Date.now() - mine.startedAt < QUICK_END_MS
    mine.quickEnds = quick ? mine.quickEnds + 1 : 0
    if (mine.quickEnds < MAX_QUICK_ENDS) {
      listen(mine)
      return
    }
    mine.failure = "Dictation keeps stopping by itself, so it's off for now. Try again in a moment."
  }
  finish(mine)
}

function finish(mine: Session, { quietly = false, abort = false } = {}) {
  if (session !== mine) return
  session = null
  mine.wanted = false
  clearTimeout(mine.stopTimer)
  if (abort) {
    try {
      mine.recognition?.abort()
    } catch {
      // It had already ended.
    }
  }
  useDictation.setState(IDLE)
  if (quietly) return
  if (mine.failure) toast.error(mine.failure)
  else announce("Stopped listening")
}
