import { describe, expect, it } from "vitest"
import { CONTEXT_SIZES, LOCAL_SERVERS, PROVIDERS, contextSizeLabel, isProviderId, ollamaAllows } from "./providers"

describe("providers", () => {
  it("recognizes only known provider ids", () => {
    expect(isProviderId("local")).toBe(true)
    expect(isProviderId("openai")).toBe(true)
    expect(isProviderId("ollama")).toBe(false)
    expect(isProviderId(null)).toBe(false)
  })

  it("keeps provider metadata internally consistent", () => {
    expect(Object.values(PROVIDERS).map((provider) => provider.id).sort()).toEqual([
      "anthropic",
      "local",
      "openai",
      "openrouter",
    ])
    expect(PROVIDERS.anthropic.api).toBe("anthropic")
    expect(PROVIDERS.local.keyUrl).toBeNull()
    expect(LOCAL_SERVERS.map((server) => server.baseUrl)).toEqual([
      "http://localhost:11434/v1",
      "http://localhost:1234/v1",
    ])
    expect(CONTEXT_SIZES).toContain(128000)
  })

  it("labels context sizes as tokens and approximate words", () => {
    expect(contextSizeLabel(8000)).toBe("8k tokens (about 6,000 words)")
    expect(contextSizeLabel(32_000)).toBe("32k tokens (about 24,000 words)")
  })

  it("knows Ollama answers pages on this computer's addresses, and needs telling about any other", () => {
    expect(ollamaAllows("http://localhost:5173")).toBe(true)
    expect(ollamaAllows("https://127.0.0.1:4173")).toBe(true)
    expect(ollamaAllows("http://0.0.0.0")).toBe(true)
    expect(ollamaAllows("https://bookbookbook.app")).toBe(false)
    expect(ollamaAllows("http://192.168.1.20:5173")).toBe(false)
    expect(ollamaAllows("http://localhost.example.com")).toBe(false)
    expect(ollamaAllows("null")).toBe(false)
  })
})
