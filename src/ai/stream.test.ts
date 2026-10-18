import { describe, expect, it, vi } from "vitest"
import { PROVIDERS } from "./providers"
import type { Connection } from "./settings"
import { AiError, listModels, streamChat } from "./stream"

const connection = (id: keyof typeof PROVIDERS, patch: Partial<Connection> = {}): Connection => ({
  provider: PROVIDERS[id],
  model: id === "anthropic" ? "claude-sonnet-5-5" : "gpt-5.4-mini",
  baseUrl: PROVIDERS[id].baseUrl,
  contextTokens: PROVIDERS[id].contextTokens,
  key: id === "local" ? null : "sk-test",
  ...patch,
})

const stream = (chunks: readonly string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })

const sseResponse = (chunks: readonly string[]) =>
  new Response(stream(chunks), { headers: { "content-type": "text/event-stream" } })

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } })

describe("streamChat", () => {
  it("streams OpenAI-style events and sends the expected request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"length"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
        "data: [DONE]\n\n",
      ]),
    )
    const pieces: string[] = []
    const result = await streamChat(
      {
        connection: connection("openai"),
        system: "system",
        user: "user",
        maxTokens: 50,
        onText: (text) => pieces.push(text),
      },
      fetcher,
    )
    expect(pieces).toEqual(["Hel", "lo"])
    expect(result).toEqual({ finish: "length", usage: { input: 7, output: 3 } })
    expect(fetcher).toHaveBeenCalledWith("https://api.openai.com/v1/chat/completions", expect.any(Object))
    const init = fetcher.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer sk-test" })
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "gpt-5.4-mini",
      stream: true,
      max_completion_tokens: 2098,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      stream_options: { include_usage: true },
    })
  })

  it("streams Anthropic-style events with browser headers", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":9}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    )
    const text: string[] = []
    const result = await streamChat(
      {
        connection: connection("anthropic"),
        system: "sys",
        user: "usr",
        maxTokens: 20,
        onText: (piece) => text.push(piece),
      },
      fetcher,
    )
    expect(text).toEqual(["A"])
    expect(result).toEqual({ finish: "length", usage: { input: 5, output: 9 } })
    expect(fetcher).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.any(Object))
    const init = fetcher.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({
      "x-api-key": "sk-test",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 2068,
      system: "sys",
      messages: [{ role: "user", content: "usr" }],
      output_config: { effort: "low" },
    })
  })

  it("returns whole JSON answers and maps HTTP or network failures", async () => {
    const whole = await streamChat(
      {
        connection: connection("local", { model: "llama" }),
        system: "",
        user: "",
        maxTokens: 10,
        onText: (text) => expect(text).toBe("whole answer"),
      },
      async () => jsonResponse({ choices: [{ message: { content: "whole answer" } }] }),
    )
    expect(whole).toEqual({ finish: "stop", usage: null })

    await expect(
      streamChat(
        { connection: connection("openai"), system: "", user: "", maxTokens: 1, onText: () => undefined },
        async () => jsonResponse({ error: { message: "bad key" } }, { status: 401 }),
      ),
    ).rejects.toMatchObject({ kind: "key" })
    await expect(
      streamChat(
        { connection: connection("openai"), system: "", user: "", maxTokens: 1, onText: () => undefined },
        async () => {
          throw new TypeError("offline")
        },
      ),
    ).rejects.toMatchObject({ kind: "network" })
  })

  it("lets abort errors through", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      streamChat(
        {
          connection: connection("openai"),
          system: "",
          user: "",
          maxTokens: 1,
          signal: controller.signal,
          onText: () => undefined,
        },
        async () => {
          throw new DOMException("stopped", "AbortError")
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("listModels", () => {
  it("filters, deduplicates and sorts chat model ids", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: [{ id: "gpt-z" }, { id: "text-embedding-3" }, { id: "gpt-a" }, { id: "gpt-a" }] }),
    )
    await expect(listModels(connection("openai"), fetcher)).resolves.toEqual(["gpt-a", "gpt-z"])
    expect(fetcher).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.any(Object))
  })

  it("rejects provider answers that are not model lists", async () => {
    await expect(listModels(connection("openai"), async () => jsonResponse({ data: "nope" }))).rejects.toBeInstanceOf(
      AiError,
    )
  })
})
