import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildBook } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import { PROVIDERS } from "./providers"
import type { Connection } from "./settings"
import { isRunning, retryRun, sentFor, shownOutput, startRun, stopAllRuns, stopRun, useRuns, type Prompt } from "./runs"
import type { Card, CardRequest } from "./cards"

let db: ReturnType<typeof createTestDb>

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "One" }] })
  useRuns.setState({ runs: {} })
})

afterEach(() => {
  stopAllRuns()
  db.close()
})

const connection = (key = "sk"): Connection => ({
  provider: PROVIDERS.openai,
  model: "gpt-5.4-mini",
  baseUrl: PROVIDERS.openai.baseUrl,
  contextTokens: PROVIDERS.openai.contextTokens,
  key,
})

const prompt: Prompt = { system: "system", user: "user", maxTokens: 10 }

const request: CardRequest = {
  tool: "continue",
  toolName: "Continue",
  output: "prose",
  placement: "insert",
  fields: {},
  sceneId: "sc-One-1",
  chapterId: "ch-One",
}

const waitFor = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("timed out")
}

const response = (text: string) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"${text}"}}]}\n\n`))
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
        controller.close()
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  )

describe("runs store", () => {
  it("shows stopped rows as stopped when no live run exists", () => {
    const card: Card = {
      id: "card",
      model: "gpt",
      route: "openai",
      createdAt: "",
      output: { v: 1, status: "running", variants: [], request },
    }
    expect(shownOutput(card, undefined).status).toBe("stopped")
    expect(shownOutput(card, { status: "running", variants: ["hi"] }).variants).toEqual(["hi"])
  })

  it("starts runs, saves streamed answers and retries only with the same connection", async () => {
    const id = await startRun({
      db,
      bookId: "book",
      connection: connection(),
      prompt,
      variants: 2,
      request,
      trimmed: true,
      fetcher: async () => response("hello"),
    })
    expect(isRunning(id)).toBe(true)
    expect(sentFor(id)?.trimmed).toBe(true)
    await waitFor(() => !isRunning(id))
    const row = await db.get<{ output: string }>("SELECT output FROM ai_cards WHERE id = ?", [id])
    expect(JSON.parse(row.output)).toMatchObject({
      status: "done",
      variants: ["hello", "hello"],
      trimmed: true,
      finish: "stop",
    })
    expect(await retryRun(db, "book", id, connection("changed"))).toBeNull()
    const retry = await retryRun(db, "book", id, connection())
    expect(retry).toEqual(expect.any(String))
  })

  it("can stop a running request", async () => {
    const id = await startRun({
      db,
      bookId: "book",
      connection: connection(),
      prompt,
      variants: 1,
      request,
      trimmed: false,
      fetcher: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")))
        }),
    })
    stopRun(id)
    await waitFor(() => !isRunning(id))
    const row = await db.get<{ output: string }>("SELECT output FROM ai_cards WHERE id = ?", [id])
    expect(JSON.parse(row.output).status).toBe("stopped")
  })
})
