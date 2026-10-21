import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  draftFailed,
  draftSaved,
  draftWaiting,
  flushDrafts,
  saveOnLeaving,
  useSaveState,
  writeEnded,
  writeStarted,
} from "./saveStatus"

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget())
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }))
})
afterEach(() => {
  for (const id of ["a", "b"]) draftSaved(id)
  useSaveState.setState({ writing: 0, waiting: 0, failed: [], savedAt: null })
  vi.unstubAllGlobals()
})

test("counts writes under way, and when one last finished", () => {
  writeStarted()
  writeStarted()
  expect(useSaveState.getState()).toMatchObject({ writing: 2, savedAt: null })
  writeEnded(true)
  expect(useSaveState.getState().writing).toBe(1)
  expect(useSaveState.getState().savedAt).toBeTypeOf("number")
})

test("a failed write leaves the work not saved until a write works again", () => {
  writeStarted()
  writeEnded(false)
  expect(useSaveState.getState()).toMatchObject({ writing: 0, failed: ["edit"], savedAt: null })
  writeStarted()
  writeEnded(false)
  expect(useSaveState.getState().failed).toEqual(["edit"])
  writeStarted()
  writeEnded(true)
  expect(useSaveState.getState().failed).toEqual([])
})

test("follows fields' typing until it's written, and keeps typing that failed to save", async () => {
  const flushA = vi.fn(async () => draftSaved("a"))
  draftWaiting("a", flushA)
  draftWaiting("b", async () => undefined)
  expect(useSaveState.getState().waiting).toBe(2)

  const retry = vi.fn(async () => draftSaved("b"))
  draftFailed("b", retry)
  expect(useSaveState.getState()).toMatchObject({ waiting: 2, failed: ["draft:b"] })

  await flushDrafts()
  expect(flushA).toHaveBeenCalledOnce()
  expect(retry).toHaveBeenCalledOnce()
  expect(useSaveState.getState()).toMatchObject({ waiting: 0, failed: [] })
})

test("writes fields' typing as the tab is hidden, and asks before closing it with work not saved", () => {
  const flush = vi.fn(async () => undefined)
  draftWaiting("a", flush)
  const stop = saveOnLeaving()

  Object.assign(document, { visibilityState: "hidden" })
  document.dispatchEvent(new Event("visibilitychange"))
  expect(flush).toHaveBeenCalledTimes(1)

  class BeforeUnload extends Event {
    returnValue = true
  }
  const closing = new BeforeUnload("beforeunload", { cancelable: true })
  window.dispatchEvent(closing)
  expect(closing.defaultPrevented).toBe(true)
  expect(flush).toHaveBeenCalledTimes(2)

  draftSaved("a")
  const saved = new BeforeUnload("beforeunload", { cancelable: true })
  window.dispatchEvent(saved)
  expect(saved.defaultPrevented).toBe(false)

  stop()
  window.dispatchEvent(new Event("pagehide"))
  expect(flush).toHaveBeenCalledTimes(2)
})
