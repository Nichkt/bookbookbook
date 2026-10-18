import { describe, expect, it } from "vitest"
import {
  AUDIENCE_OPTIONS,
  NOT_SET,
  POV_OPTIONS,
  TENSE_OPTIONS,
  passagesText,
  splitPassages,
  storedPassages,
  styleChoice,
  stylePrompt,
} from "./bookStyle"

describe("book style settings", () => {
  it("maps option values to select choices and prompt text", () => {
    expect(styleChoice(POV_OPTIONS, "third_limited")).toBe("third_limited")
    expect(styleChoice(POV_OPTIONS, "unknown")).toBe(NOT_SET)
    expect(stylePrompt(POV_OPTIONS, "third_limited")).toBe("third person limited, close to one character at a time")
    expect(stylePrompt(TENSE_OPTIONS, " present ")).toBe("present tense")
    expect(stylePrompt(AUDIENCE_OPTIONS, "custom audience")).toBe("custom audience")
  })

  it("serializes sample passages as trimmed non-empty paragraphs", () => {
    const text = " First sample.\nline two.\n\n\nSecond sample. \n\n "
    expect(splitPassages(text)).toEqual(["First sample.\nline two.", "Second sample."])
    expect(storedPassages(text)).toBe(JSON.stringify(["First sample.\nline two.", "Second sample."]))
    expect(passagesText(storedPassages(text))).toBe("First sample.\nline two.\n\nSecond sample.")
    expect(passagesText("junk")).toBe("")
  })
})
