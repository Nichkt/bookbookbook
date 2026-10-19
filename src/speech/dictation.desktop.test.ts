import { expect, test, vi } from "vitest"
import { failureMessage } from "./dictation"

// As built for the desktop app, which has no address bar, and no dictating on the device in WebView2.
vi.mock("@/app/desktop", () => ({ desktop: true }))

test("the desktop app sends a refused microphone to Windows' settings, not the address bar", () => {
  const message = failureMessage("not-allowed", "online")
  expect(message).toMatch(/^Windows won't let bookbookbook use the microphone/)
  expect(message).toMatch(/microphone privacy/)
  expect(message).not.toMatch(/address bar/)
})

test("the desktop app offers Windows' own dictation when Microsoft's speech service is out of reach", () => {
  const message = failureMessage("network", "online")
  expect(message).toMatch(/Microsoft's speech service/)
  expect(message).toMatch(/Windows key \+ H/)
  expect(message).not.toMatch(/on this device/)
  expect(failureMessage("network", "on-device")).toBe("Dictation lost its connection. Try again.")
})
