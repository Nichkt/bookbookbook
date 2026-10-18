import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { announce } from "@/app/feedback"
import { toast } from "sonner"
import type { Step } from "./commands"
import {
  cancelDictation,
  failureMessage,
  startDictation,
  stopDictation,
  useDictation,
  type DictationOptions,
  type DictationTarget,
} from "./dictation"
import type { Recognition, RecognitionResultEvent } from "./engine"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
vi.mock("@/app/feedback", () => ({ announce: vi.fn(), reportError: vi.fn() }))

class FakeRecognition implements Recognition {
  static made: FakeRecognition[] = []
  lang = ""
  continuous = false
  interimResults = false
  processLocally?: boolean
  onstart: (() => void) | null = null
  onresult: ((event: RecognitionResultEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  started = false
  stopped = false
  aborted = false
  constructor() {
    FakeRecognition.made.push(this)
  }
  start() {
    this.started = true
  }
  stop() {
    this.stopped = true
  }
  abort() {
    this.aborted = true
  }
  /** Results as Chrome reports them: the session's whole list, and the first that changed. */
  hear(resultIndex: number, ...results: [transcript: string, final: boolean][]) {
    this.onresult?.({
      resultIndex,
      results: results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
    })
  }
}

const ENGLISH: DictationOptions = { engine: "on-device", lang: "en-US", commands: true }

let pieces: Step[][]
const target = (id = "note", moments = false): DictationTarget => ({
  id,
  label: "your note",
  moments,
  insert: (steps) => void pieces.push([...steps]),
})
const recognizer = (index = -1) => FakeRecognition.made.at(index)!
const status = () => useDictation.getState().status

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecognition.made = []
  pieces = []
  vi.mocked(announce).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(() => {
  const { targetId } = useDictation.getState()
  if (targetId) cancelDictation(targetId)
  vi.useRealTimers()
})

describe("a session", () => {
  test("listens on the device in the language, shows what it's hearing, and types each settled piece", () => {
    expect(startDictation(target(), ENGLISH, FakeRecognition)).toBe(true)
    const rec = recognizer()
    expect(rec).toMatchObject({ lang: "en-US", continuous: true, interimResults: true, processLocally: true })
    expect(rec.started).toBe(true)
    expect(useDictation.getState()).toMatchObject({ status: "starting", targetId: "note", label: "your note" })
    rec.onstart?.()
    expect(status()).toBe("listening")
    expect(announce).toHaveBeenCalledWith("Listening")

    rec.hear(0, ["she opened the", false])
    expect(useDictation.getState().interim).toBe("she opened the")
    expect(pieces).toEqual([])

    rec.hear(0, ["she opened the door period", true])
    expect(pieces).toEqual([[{ kind: "words", text: "she opened the door" }, { kind: "mark", mark: "." }]])
    expect(useDictation.getState().interim).toBe("")

    // A list with a settled piece already typed, as Chrome reports one: only the new piece goes in.
    rec.hear(0, ["she opened the door period", true], [" new moment then", true], [" more", false])
    expect(pieces.slice(1)).toEqual([[{ kind: "words", text: "new moment then" }]])
    expect(useDictation.getState().interim).toBe("more")
  })

  test("online, nothing asks for the device; commands work only in English, and new moment where asked", () => {
    startDictation(target("beats", true), { engine: "online", lang: "en-GB", commands: true }, FakeRecognition)
    expect(recognizer().processLocally).toBeUndefined()
    recognizer().hear(0, ["one new moment two", true])
    expect(pieces).toEqual([
      [
        { kind: "words", text: "one" },
        { kind: "break", paragraph: false },
        { kind: "words", text: "two" },
      ],
    ])
    startDictation(target(), { engine: "online", lang: "fr-FR", commands: true }, FakeRecognition)
    recognizer().hear(0, ["bonjour period", true])
    expect(pieces.at(-1)).toEqual([{ kind: "words", text: "bonjour period" }])
  })

  test("starts again when the browser stops after a silence, but gives up if it keeps stopping at once", () => {
    startDictation(target(), ENGLISH, FakeRecognition)
    recognizer().onstart?.()
    vi.advanceTimersByTime(5000)
    recognizer().onerror?.({ error: "no-speech" })
    recognizer().onend?.()
    expect(FakeRecognition.made).toHaveLength(2)
    expect(recognizer().started).toBe(true)
    expect(status()).toBe("listening")

    recognizer().onend?.()
    recognizer().onend?.()
    expect(FakeRecognition.made).toHaveLength(4)
    recognizer().onend?.()
    expect(FakeRecognition.made).toHaveLength(4)
    expect(status()).toBe("idle")
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("keeps stopping"))
  })

  test("Stop lets the last piece settle and go in, then ends for good", () => {
    startDictation(target(), ENGLISH, FakeRecognition)
    const rec = recognizer()
    rec.onstart?.()
    stopDictation()
    expect(rec.stopped).toBe(true)
    expect(status()).toBe("stopping")
    rec.hear(0, ["the end", true])
    expect(pieces).toEqual([[{ kind: "words", text: "the end" }]])
    rec.onend?.()
    expect(FakeRecognition.made).toHaveLength(1)
    expect(useDictation.getState()).toMatchObject({ status: "idle", targetId: null })
    expect(announce).toHaveBeenLastCalledWith("Stopped listening")
  })

  test("a browser that never says it stopped is stopped regardless", () => {
    startDictation(target(), ENGLISH, FakeRecognition)
    stopDictation()
    vi.advanceTimersByTime(5000)
    expect(recognizer().aborted).toBe(true)
    expect(status()).toBe("idle")
  })

  test("saying stop listening types what came before it, then stops", () => {
    startDictation(target(), ENGLISH, FakeRecognition)
    recognizer().hear(0, ["the end period stop listening", true])
    expect(pieces).toEqual([[{ kind: "words", text: "the end" }, { kind: "mark", mark: "." }]])
    expect(recognizer().stopped).toBe(true)
  })

  test("a failure ends it and says why", () => {
    startDictation(target(), ENGLISH, FakeRecognition)
    recognizer().onerror?.({ error: "not-allowed" })
    recognizer().onend?.()
    expect(FakeRecognition.made).toHaveLength(1)
    expect(status()).toBe("idle")
    expect(toast.error).toHaveBeenCalledWith(failureMessage("not-allowed", "on-device"))
    expect(failureMessage("network", "online")).toMatch(/needs the internet/)
  })

  test("cancelling, or dictating somewhere else, ends it at once and ignores anything after", () => {
    startDictation(target("a"), ENGLISH, FakeRecognition)
    const first = recognizer()
    startDictation(target("b"), ENGLISH, FakeRecognition)
    expect(first.aborted).toBe(true)
    first.hear(0, ["late", true])
    first.onend?.()
    expect(pieces).toEqual([])
    expect(useDictation.getState().targetId).toBe("b")

    cancelDictation("a")
    expect(status()).toBe("starting")
    cancelDictation("b")
    expect(recognizer().aborted).toBe(true)
    expect(status()).toBe("idle")
    expect(toast.error).not.toHaveBeenCalled()
  })

  test("without speech recognition in the browser, nothing starts", () => {
    expect(startDictation(target(), ENGLISH, null)).toBe(false)
    expect(status()).toBe("idle")
  })
})
