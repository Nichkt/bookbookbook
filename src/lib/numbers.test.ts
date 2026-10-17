import { describe, expect, it } from "vitest"
import { formatCount, parseCount, tidyCount } from "./numbers"

describe("parseCount", () => {
  it("reads plain and grouped numbers", () => {
    expect(parseCount("3000")).toBe(3000)
    expect(parseCount(" 80,000 ")).toBe(80000)
    expect(parseCount("1_500")).toBe(1500)
    expect(parseCount("2500.6")).toBe(2501)
  })

  it("reads empty, negative or non-numbers as null", () => {
    expect(parseCount("")).toBeNull()
    expect(parseCount("lots")).toBeNull()
    expect(parseCount("-5")).toBeNull()
    expect(parseCount("0")).toBeNull()
  })

  it.each(["en-US", "de-DE", "fr-FR", "de-CH", "en-IN"])("reads back what formatCount shows in %s", (locale) => {
    for (const value of [950, 3000, 80000, 1250000]) {
      expect(parseCount(formatCount(value, locale), locale)).toBe(value)
    }
  })
})

describe("tidyCount", () => {
  it("adds separators to numbers and leaves other text alone", () => {
    expect(tidyCount("3250", "en-US")).toBe("3,250")
    expect(tidyCount("3,250", "en-US")).toBe("3,250")
    expect(tidyCount("3250", "de-DE")).toBe("3.250")
    expect(tidyCount("lots", "en-US")).toBe("lots")
    expect(tidyCount("", "en-US")).toBe("")
  })
})
