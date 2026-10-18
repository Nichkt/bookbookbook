import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "@/test/sqliteDb"
import {
  choiceFor,
  connectionOf,
  forgetKey,
  isWebAddress,
  keyMap,
  maskedKey,
  parseAiSettings,
  readKeys,
  routeLabel,
  saveKey,
  setupProblem,
  withChoice,
} from "./settings"

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => db.close())

describe("AI settings", () => {
  it("parses junk and partial JSON with defaults", () => {
    expect(parseAiSettings("nope")).toEqual({ provider: null, choices: {} })
    expect(
      parseAiSettings(
        JSON.stringify({
          provider: "openai",
          choices: {
            openai: { model: "gpt-x", baseUrl: " https://api.example/v1 ", contextTokens: 16000 },
            nope: { model: "bad" },
            local: { model: 2, baseUrl: "", contextTokens: 12 },
          },
        }),
      ),
    ).toEqual({
      provider: "openai",
      choices: {
        openai: { model: "gpt-x", baseUrl: " https://api.example/v1 ", contextTokens: 16000 },
        local: { model: "", baseUrl: "http://localhost:11434/v1", contextTokens: 4000 },
      },
    })
  })

  it("chooses defaults, applies patches and reports setup problems", () => {
    const settings = withChoice({ provider: "openai", choices: {} }, "openai", {
      model: "gpt-custom",
      baseUrl: "https://api.example/v1/",
    })
    expect(choiceFor(settings, "openai")).toMatchObject({ model: "gpt-custom" })
    expect(isWebAddress("https://example.com")).toBe(true)
    expect(isWebAddress("ftp://example.com")).toBe(false)
    expect(setupProblem({ provider: null, choices: {} }, new Map())).toBe("Choose where the AI runs.")
    expect(setupProblem(settings, new Map())).toBe("Add your OpenAI API key.")
    expect(connectionOf(settings, new Map([["openai", " sk-test "]]))).toMatchObject({
      model: "gpt-custom",
      baseUrl: "https://api.example/v1",
      key: "sk-test",
    })
    expect(routeLabel("openai", "gpt-custom")).toBe("OpenAI · gpt-custom")
    expect(maskedKey(" sk-abcdef ")).toBe("••••cdef")
  })

  it("reads, saves and forgets provider keys in the device table", async () => {
    expect(keyMap([{ id: "openai", secret: "sk-a" }, { id: "empty", secret: null }])).toEqual(
      new Map([["openai", "sk-a"]]),
    )
    await saveKey(db, "openai", " sk-first ")
    expect(await readKeys(db)).toEqual(new Map([["openai", "sk-first"]]))
    await saveKey(db, "openai", "sk-second")
    expect(await db.get("SELECT label, secret FROM provider_keys WHERE id = 'openai'")).toEqual({
      label: "OpenAI key ending cond",
      secret: "sk-second",
    })
    await forgetKey(db, "openai")
    expect(await readKeys(db)).toEqual(new Map())
  })
})
