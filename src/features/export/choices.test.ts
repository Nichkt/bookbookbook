import { expect, test } from "vitest"
import { CHAPTER_HEADINGS } from "@/export/manuscript"
import { exportPrefKey, HEADINGS, parseChoices } from "./choices"

const DEFAULTS = { format: "docx", headings: "number-title", font: "times", perChapter: false }

test("defaults, with the paper the locale uses", () => {
  expect(parseChoices(null, "en-US")).toEqual({ ...DEFAULTS, paper: "letter" })
  expect(parseChoices(null, "en-GB")).toEqual({ ...DEFAULTS, paper: "a4" })
  expect(parseChoices(null, "de")).toEqual({ ...DEFAULTS, paper: "a4" })
})

test("reads stored choices", () => {
  const stored = { format: "markdown", headings: "title", font: "courier", paper: "a4", perChapter: true }
  expect(parseChoices(JSON.stringify(stored), "en-US")).toEqual(stored)
  expect(parseChoices(JSON.stringify({ ...stored, format: "backup" }), "en-US").format).toBe("backup")
})

test("anything unreadable falls back to its default", () => {
  for (const raw of ["", "not json", "null", "[]", "42", '"docx"']) {
    expect(parseChoices(raw, "en-US")).toEqual({ ...DEFAULTS, paper: "letter" })
  }
  const odd = { format: "pdf", headings: 3, font: null, paper: "legal", perChapter: "yes" }
  expect(parseChoices(JSON.stringify(odd), "en-GB")).toEqual({ ...DEFAULTS, paper: "a4" })
  expect(parseChoices(JSON.stringify({ headings: "number" }), "en-GB")).toEqual({
    ...DEFAULTS,
    headings: "number",
    paper: "a4",
  })
})

test("offers every heading style", () => {
  expect(HEADINGS.map((option) => option.value)).toEqual(CHAPTER_HEADINGS)
})

test("the pref goes with the book", () => {
  expect(exportPrefKey("book-1")).toBe("export.choices:book-1")
})
