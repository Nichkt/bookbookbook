import { describe, expect, it } from "vitest"
import { diffParagraphs, formatWhen, isSnapshotShortcut, restoreDiff, versionName } from "./history"

describe("versionName", () => {
  it("prefers the writer's name, then the kind", () => {
    expect(versionName({ kind: "manual", label: " Before the rewrite " })).toBe("Before the rewrite")
    expect(versionName({ kind: "manual", label: "" })).toBe("Snapshot")
    expect(versionName({ kind: "auto", label: null })).toBe("Automatic")
  })
})

describe("formatWhen", () => {
  const now = new Date(2025, 2, 4, 18, 0)
  // Newer ICU puts a narrow no-break space before AM/PM.
  const when = (date: Date) => formatWhen(date.toISOString(), now, "en-US").replace(/\s/g, " ")

  it("says today and yesterday", () => {
    expect(when(new Date(2025, 2, 4, 15, 42))).toBe("today at 3:42 PM")
    expect(when(new Date(2025, 2, 3, 9, 5))).toBe("yesterday at 9:05 AM")
  })

  it("gives the date otherwise, with the year only when it isn't this one", () => {
    expect(when(new Date(2025, 0, 28, 15, 42))).toBe("Jan 28 at 3:42 PM")
    expect(when(new Date(2024, 11, 31, 23, 59))).toBe("Dec 31, 2024 at 11:59 PM")
  })
})

describe("restoreDiff", () => {
  it("counts the words a restore would bring back and take out", () => {
    const diff = restoreDiff("The gull rose over the harbor.", "The gull circled low over the harbor.")
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(1)
    expect(diff.parts?.map((part) => part.value).join("")).toContain("circled low")
  })

  it("marks nothing when the texts match", () => {
    const diff = restoreDiff("Same words.\nSecond line.", "Same words.\nSecond line.")
    expect(diff).toMatchObject({ added: 0, removed: 0 })
    expect(diff.parts?.every((part) => !part.added && !part.removed)).toBe(true)
  })
})

describe("diffParagraphs", () => {
  it("splits the comparison into paragraphs, keeping the marks", () => {
    const diff = restoreDiff("The gull rose.\nThe tide turned.", "The gull rose.\nThe tide went out.")
    expect(diffParagraphs(diff.parts ?? [])).toEqual([
      [{ text: "The gull rose." }],
      [{ text: "The tide " }, { text: "turned", change: "removed" }, { text: "went out", change: "added" }, { text: "." }],
    ])
  })

  it("keeps blank lines, such as scene breaks, as empty paragraphs", () => {
    expect(diffParagraphs([{ value: "Before.\n\nAfter.", added: false, removed: false }])).toEqual([
      [{ text: "Before." }],
      [],
      [{ text: "After." }],
    ])
  })
})

describe("isSnapshotShortcut", () => {
  const key = (init: Partial<KeyboardEvent> & { altGraph?: boolean }) =>
    ({
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      key: "",
      code: "",
      ...init,
      getModifierState: (name: string) => name === "AltGraph" && !!init.altGraph,
    }) as unknown as KeyboardEvent

  it("takes Ctrl+Alt+S, and ⌘⌥S on a Mac where it types ß", () => {
    expect(isSnapshotShortcut(key({ ctrlKey: true, altKey: true, key: "s", code: "KeyS" }))).toBe(true)
    expect(isSnapshotShortcut(key({ metaKey: true, altKey: true, key: "ß", code: "KeyS" }))).toBe(true)
  })

  it("leaves AltGr, Shift and plain Ctrl+S alone", () => {
    expect(isSnapshotShortcut(key({ ctrlKey: true, altKey: true, altGraph: true, key: "ś", code: "KeyS" }))).toBe(false)
    expect(isSnapshotShortcut(key({ ctrlKey: true, altKey: true, shiftKey: true, key: "S", code: "KeyS" }))).toBe(false)
    expect(isSnapshotShortcut(key({ ctrlKey: true, key: "s", code: "KeyS" }))).toBe(false)
  })
})
