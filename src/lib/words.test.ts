import { describe, expect, it } from "vitest"
import { countWords } from "./words"

describe("countWords", () => {
  it.each([
    ["", 0],
    ["   \n\t ", 0],
    ["One", 1],
    ["The ferry nosed through the harbor.", 6],
    ["Mara's brother", 2],
    ["Wait — what?", 2],
    ["Wait—what?", 1],
    ["She counted to 37 and stopped", 6],
    ["* * *", 0],
    ["“Quoted,” he said…", 3],
    ["Zoë and Ægir", 3],
    ["line one\nline two", 4],
  ])("%j has %i words", (text, expected) => {
    expect(countWords(text)).toBe(expected)
  })
})
