import { expect, test } from "vitest"
import type { UpdateState } from "@/app/updates"
import { actionOf, hintOf, statusOf } from "./steps"

const newer = { version: "0.1.2", notes: "" }

test("each step has its sentence, and the one button changes its job rather than going away", () => {
  const steps: [UpdateState, string, string, "check" | "install" | null][] = [
    [{ step: "idle" }, "Checking for a new version…", "Checking…", null],
    [{ step: "checking" }, "Checking for a new version…", "Checking…", null],
    [{ step: "latest" }, "You have the newest version.", "Check again", "check"],
    [{ step: "found", ...newer }, "bookbookbook 0.1.2 is out.", "Update now", "install"],
    [
      { step: "downloading", ...newer, received: 0, total: null },
      "Downloading bookbookbook 0.1.2…",
      "Downloading…",
      null,
    ],
    [
      { step: "ready", ...newer },
      "bookbookbook 0.1.2 has downloaded, and is ready to install.",
      "Install now",
      "install",
    ],
    [
      { step: "installing", ...newer },
      "Saving your work, then installing bookbookbook 0.1.2. It closes, and opens again in a moment.",
      "Installing…",
      null,
    ],
  ]
  for (const [state, status, label, does] of steps) {
    expect(statusOf(state)).toBe(status)
    expect(actionOf(state)).toMatchObject({ label, does })
  }
})

test("what failed is said plainly, and Try again goes back to it", () => {
  const check: UpdateState = { step: "failed", during: "check", message: "timed out" }
  expect(statusOf(check)).toMatch(/^bookbookbook couldn't check for a new version\. Check you're connected/)
  expect(actionOf(check)).toMatchObject({ label: "Try again", does: "check" })

  const download: UpdateState = { step: "failed", during: "download", message: "reset", ...newer }
  // As when the download breaks off, or isn't what the key signed.
  expect(statusOf(download)).toBe(
    "bookbookbook 0.1.2 didn't download properly, so nothing has changed. Check you're connected to the internet " +
      "and try again, or download it from GitHub.",
  )
  expect(actionOf(download)).toMatchObject({ label: "Try again", does: "install" })

  const install: UpdateState = { step: "failed", during: "install", message: "denied", ...newer }
  expect(statusOf(install)).toBe("bookbookbook 0.1.2 couldn't be installed. Try again, or download it from GitHub.")
  expect(actionOf(install)).toMatchObject({ label: "Try again", does: "install" })
})

test("before it closes the app, the writer is told it will, and that their books are safe", () => {
  expect(hintOf({ step: "found", ...newer })).toMatch(/closes bookbookbook for a moment.*books and settings stay/)
  expect(hintOf({ step: "ready", ...newer })).toMatch(/closes bookbookbook for a moment.*books and settings stay/)
  expect(hintOf({ step: "downloading", ...newer, received: 0, total: null })).toMatch(/asks before it installs/)
  expect(hintOf({ step: "latest" })).toBeNull()
})
