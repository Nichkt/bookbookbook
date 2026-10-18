import { describe, expect, it } from "vitest"
import { charsForTokens, estimateTokens, formatTokens, tokensForWords } from "./tokens"

describe("token estimates", () => {
  it("counts about four characters per token, rounded up", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("abcde")).toBe(2)
    expect(charsForTokens(12.9)).toBe(51)
    expect(charsForTokens(-3)).toBe(0)
  })

  it("formats estimates for the UI", () => {
    expect(formatTokens(850)).toBe("~850")
    expect(formatTokens(1234)).toBe("~1.2k")
    expect(formatTokens(9800)).toBe("~9.8k")
    expect(formatTokens(12_345)).toBe("~12k")
  })

  it("leaves answer room for requested words", () => {
    expect(tokensForWords(100)).toBe(224)
    expect(tokensForWords(0)).toBe(64)
  })
})
