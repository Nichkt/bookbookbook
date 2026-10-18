import type { Connection } from "./settings"
import { createSseParser, type SseEvent } from "./sse"

/*
 * Streams one answer from a model (DESIGN.md §9), in either request shape, and turns what goes wrong into a sentence
 * the writer can act on. Stopping a request isn't an error: the caller's signal says it was stopped.
 */

export type AiErrorKind = "network" | "key" | "model" | "limit" | "request" | "server" | "answer"

export class AiError extends Error {
  readonly kind: AiErrorKind

  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.name = "AiError"
    this.kind = kind
  }
}

export interface ChatRequest {
  connection: Connection
  system: string
  user: string
  /** About how long the answer may be, in tokens. */
  maxTokens: number
  signal?: AbortSignal
  /** Each piece of the answer as it arrives. */
  onText: (text: string) => void
}

export interface ChatResult {
  /** "length" when the answer was cut off at its limit; "refused" when the provider wouldn't write it. */
  finish: "stop" | "length" | "refused"
  /** As the provider counted them, when it says. */
  usage: { input: number; output: number } | null
}

type Fetch = typeof fetch

/** OpenAI's reasoning models take `max_completion_tokens` and `reasoning_effort`, and only the default temperature. */
const OPENAI_REASONING = /^(?:o\d|gpt-[5-9])/
/** Claude models that take an effort level (output_config.effort). */
const CLAUDE_EFFORT = /^claude-(?:(?:fable|mythos|opus|sonnet|haiku)-5|opus-4-[5-8]|sonnet-4-6)/
/** Room for thinking on top of the answer: models that think count it against the same limit. */
const THINKING_ROOM = 2048

const endpoint = (connection: Connection, path: string) => `${connection.baseUrl.replace(/\/+$/, "")}${path}`

function headersFor(connection: Connection): Record<string, string> {
  const { provider, key } = connection
  if (provider.api === "anthropic") {
    return {
      "x-api-key": key ?? "",
      "anthropic-version": "2023-06-01",
      // Anthropic asks browsers to say they mean to send a key from the page (DESIGN.md §9).
      "anthropic-dangerous-direct-browser-access": "true",
    }
  }
  const headers: Record<string, string> = {}
  if (key) headers.Authorization = `Bearer ${key}`
  if (provider.id === "openrouter") headers["X-Title"] = "bookbookbook"
  return headers
}

function requestBody(request: ChatRequest): Record<string, unknown> {
  const { connection, system, user, maxTokens } = request
  const { provider, model } = connection
  if (provider.api === "anthropic") {
    return {
      model,
      max_tokens: maxTokens + THINKING_ROOM,
      stream: true,
      system,
      messages: [{ role: "user", content: user }],
      ...(CLAUDE_EFFORT.test(model) ? { output_config: { effort: "low" } } : {}),
    }
  }
  const body: Record<string, unknown> = {
    model,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  }
  if (provider.id === "openai") {
    const reasoning = OPENAI_REASONING.test(model)
    body.max_completion_tokens = maxTokens + (reasoning ? THINKING_ROOM : 0)
    if (reasoning) body.reasoning_effort = "low"
  } else {
    body.max_tokens = maxTokens + THINKING_ROOM
  }
  // Ollama and LM Studio may not know this option; the providers count usage with it.
  if (provider.id !== "local") body.stream_options = { include_usage: true }
  return body
}

/** The provider's own words about an error, from the usual JSON shapes, trimmed to a sentence or two. */
function errorDetail(text: string): string {
  let detail = ""
  const json = parseJson(text)
  if (json) {
    const error = json.error
    const nested = typeof error === "object" && error !== null ? (error as { message?: unknown }).message : undefined
    const found = [error, nested, json.message, json.detail].find((value) => typeof value === "string")
    if (typeof found === "string") detail = found
  } else if (!/^\s*</.test(text)) {
    // An HTML error page says nothing useful.
    detail = text
  }
  detail = detail.replace(/\s+/g, " ").trim()
  return detail.length > 300 ? `${detail.slice(0, 299)}…` : detail
}

const withDetail = (sentence: string, detail: string) => (detail ? `${sentence} It said: “${detail}”` : sentence)

/** A failed response as something the writer can act on. */
export function httpError(connection: Connection, status: number, body: string): AiError {
  const { provider, model } = connection
  const who = provider.who
  const detail = errorDetail(body)
  if (status === 401 || status === 403) {
    if (provider.id === "local") return new AiError("key", withDetail(`${who} turned the request away.`, detail))
    return new AiError("key", `${who} didn't accept your API key. Check it in AI settings.`)
  }
  if (status === 404) {
    if (provider.id === "local") {
      return new AiError(
        "model",
        `Nothing at ${connection.baseUrl} has a model called “${model}”. ` +
          "Check the address and the model in AI settings.",
      )
    }
    return new AiError(
      "model",
      `${who} has no model called “${model}” that your key can use. Pick another in AI settings.`,
    )
  }
  if (status === 402) return new AiError("limit", withDetail(`Your ${provider.name} account is out of credit.`, detail))
  if (status === 429) {
    const sentence =
      `${who} says you've reached a limit: too many requests, or no credit left. ` +
      "Wait a minute, or check your account."
    return new AiError("limit", withDetail(sentence, detail))
  }
  if (status === 413) {
    return new AiError("request", `That was too much for ${who} to read. Lower “How much it can read” in AI settings.`)
  }
  if (status >= 500) return new AiError("server", `${who} is having trouble (error ${status}). Try again in a minute.`)
  return new AiError("request", withDetail(`${who} turned the request down (error ${status}).`, detail))
}

/** A request that got no response at all: offline, a wrong address, or a server that doesn't let this page in. */
export function networkError(connection: Connection): AiError {
  if (connection.provider.id === "local") {
    return new AiError(
      "network",
      `Couldn't reach ${connection.baseUrl}. ` +
        "Check that Ollama or LM Studio is running and lets this page in (see AI settings).",
    )
  }
  return new AiError("network", `Couldn't reach ${connection.provider.who}. Check your internet connection.`)
}

const finishOf = (reason: unknown): ChatResult["finish"] | null => {
  if (reason === "length" || reason === "max_tokens") return "length"
  if (reason === "content_filter" || reason === "refusal") return "refused"
  return typeof reason === "string" ? "stop" : null
}

interface StreamState {
  finish: ChatResult["finish"]
  usage: ChatResult["usage"]
  done: boolean
}

function parseJson(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data)
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const numberOr = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback)

function openAiEvent(connection: Connection, event: SseEvent, state: StreamState, onText: (text: string) => void) {
  if (event.data.trim() === "[DONE]") {
    state.done = true
    return
  }
  const json = parseJson(event.data)
  if (!json) return
  if (json.error) {
    const sentence = `${connection.provider.who} stopped with an error.`
    throw new AiError("server", withDetail(sentence, errorDetail(event.data)))
  }
  const choice = (json.choices as { delta?: { content?: unknown }; finish_reason?: unknown }[] | undefined)?.[0]
  const text = choice?.delta?.content
  if (typeof text === "string" && text) onText(text)
  const finish = finishOf(choice?.finish_reason)
  if (finish) state.finish = finish
  const usage = json.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined
  if (usage) state.usage = { input: numberOr(usage.prompt_tokens, 0), output: numberOr(usage.completion_tokens, 0) }
}

function anthropicEvent(connection: Connection, event: SseEvent, state: StreamState, onText: (text: string) => void) {
  const json = parseJson(event.data)
  if (!json) return
  switch (json.type) {
    case "message_start": {
      const usage = (json.message as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | undefined)?.usage
      if (usage) state.usage = { input: numberOr(usage.input_tokens, 0), output: numberOr(usage.output_tokens, 0) }
      break
    }
    case "content_block_delta": {
      // Thinking arrives as thinking_delta: only the answer is shown.
      const delta = json.delta as { type?: unknown; text?: unknown } | undefined
      if (delta?.type === "text_delta" && typeof delta.text === "string") onText(delta.text)
      break
    }
    case "message_delta": {
      const finish = finishOf((json.delta as { stop_reason?: unknown } | undefined)?.stop_reason)
      if (finish) state.finish = finish
      const output = (json.usage as { output_tokens?: unknown } | undefined)?.output_tokens
      if (typeof output === "number") state.usage = { input: state.usage?.input ?? 0, output }
      break
    }
    case "message_stop":
      state.done = true
      break
    case "error": {
      const type = (json.error as { type?: unknown } | undefined)?.type
      const who = connection.provider.who
      if (type === "overloaded_error") throw new AiError("server", `${who} is busy right now. Try again in a minute.`)
      throw new AiError("server", withDetail(`${who} stopped with an error.`, errorDetail(event.data)))
    }
  }
}

/** A whole answer sent at once, by a server that doesn't stream. */
function wholeAnswer(json: Record<string, unknown> | null): string {
  const choice = (json?.choices as { message?: { content?: unknown } }[] | undefined)?.[0]
  if (typeof choice?.message?.content === "string") return choice.message.content
  const blocks = json?.content as { type?: unknown; text?: unknown }[] | undefined
  if (!Array.isArray(blocks)) return ""
  return blocks.map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : "")).join("")
}

/** Streams the model's answer to `onText`. Rejects with an AiError, or with the abort when the signal stops it. */
export async function streamChat(request: ChatRequest, fetcher: Fetch = fetch): Promise<ChatResult> {
  const { connection, signal, onText } = request
  const path = connection.provider.api === "anthropic" ? "/messages" : "/chat/completions"
  let response: Response
  try {
    response = await fetcher(endpoint(connection, path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headersFor(connection) },
      body: JSON.stringify(requestBody(request)),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw networkError(connection)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw httpError(connection, response.status, body)
  }

  const state: StreamState = { finish: "stop", usage: null, done: false }
  if (!response.body || response.headers.get("content-type")?.includes("application/json")) {
    const text = wholeAnswer(parseJson(await response.text()))
    if (text) onText(text)
    return { finish: state.finish, usage: null }
  }

  const handle = connection.provider.api === "anthropic" ? anthropicEvent : openAiEvent
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  try {
    while (!state.done) {
      const { value, done } = await reader.read()
      const events = done
        ? [...parser.push(decoder.decode()), ...parser.end()]
        : parser.push(decoder.decode(value, { stream: true }))
      for (const event of events) {
        handle(connection, event, state, onText)
        if (state.done) break
      }
      if (done) break
    }
  } catch (error) {
    if (signal?.aborted || error instanceof AiError) throw error
    throw new AiError("network", `The connection to ${connection.provider.who} dropped. Try again.`)
  } finally {
    // Closes the connection when the answer ended early, as at "[DONE]" or an error. A finished stream ignores it.
    reader.cancel().catch(() => undefined)
  }
  return { finish: state.finish, usage: state.usage }
}

/** Not chat models: OpenAI lists its embedding, speech and image models too. */
const NOT_CHAT =
  /embed|whisper|tts|dall-e|davinci|babbage|moderation|image|audio|realtime|transcribe|search|sora|computer-use/i

/** The models the provider offers to this key, for the model picker. */
export async function listModels(
  connection: Connection,
  fetcher: Fetch = fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  const path = connection.provider.api === "anthropic" ? "/models?limit=1000" : "/models"
  let response: Response
  try {
    response = await fetcher(endpoint(connection, path), { headers: headersFor(connection), signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw networkError(connection)
  }
  if (!response.ok) throw httpError(connection, response.status, await response.text().catch(() => ""))
  const json = parseJson(await response.text().catch(() => ""))
  const data = json?.data
  if (!Array.isArray(data)) {
    throw new AiError("answer", `${connection.provider.who} answered, but not with a list of models.`)
  }
  const ids = data.flatMap((model: unknown) => {
    const id = (model as { id?: unknown } | null)?.id
    return typeof id === "string" && !NOT_CHAT.test(id) ? [id] : []
  })
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}
