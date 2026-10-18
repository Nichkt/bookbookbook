/*
 * Where AI requests go (DESIGN.md §9 "Model routing"): straight from the browser to a provider the writer has a key
 * for, or to a model running on their own computer. The hosted route needs accounts and billing (M9, M10).
 */

export const PROVIDER_IDS = ["local", "openai", "anthropic", "openrouter"] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]
export const isProviderId = (value: unknown): value is ProviderId => PROVIDER_IDS.includes(value as ProviderId)

/** The two request shapes: OpenAI's chat completions (OpenRouter, Ollama and LM Studio speak it too) and Claude's. */
export type ApiStyle = "openai" | "anthropic"

export interface ProviderInfo {
  id: ProviderId
  name: string
  /** One line in the settings, under the name. */
  blurb: string
  /** Who the error messages say answered. */
  who: string
  api: ApiStyle
  baseUrl: string
  /** Where the writer makes a key; null when none is needed. */
  keyUrl: string | null
  /** The first is the default. The writer can type any model the provider has. */
  models: readonly string[]
  /** How much the AI reads at once unless the writer says otherwise, in tokens. */
  contextTokens: number
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderInfo>> = {
  local: {
    id: "local",
    name: "On this computer",
    blurb: "Free and private: a model you run yourself with Ollama or LM Studio. Your writing stays on this computer.",
    who: "The AI on this computer",
    api: "openai",
    baseUrl: "http://localhost:11434/v1",
    keyUrl: null,
    models: [],
    contextTokens: 4000,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    blurb: "The makers of ChatGPT. Needs an API key; OpenAI bills you for what you use.",
    who: "OpenAI",
    api: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-5.4-mini", "gpt-6-luna", "gpt-5.4"],
    contextTokens: 32000,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    blurb: "The makers of Claude. Needs an API key; Anthropic bills you for what you use.",
    who: "Anthropic",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
    contextTokens: 32000,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    blurb: "One key for models from many companies. Needs an API key; OpenRouter bills you for what you use.",
    who: "OpenRouter",
    api: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    models: [
      "anthropic/claude-sonnet-5.5",
      "openai/gpt-5.4-mini",
      "google/gemini-3.5-flash",
      "deepseek/deepseek-v4-flash",
    ],
    contextTokens: 32000,
  },
}

/** Addresses a model on this computer usually answers at. */
export const LOCAL_SERVERS = [
  { name: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { name: "LM Studio", baseUrl: "http://localhost:1234/v1" },
] as const

/** The hosts Ollama answers pages from, on any port, without OLLAMA_ORIGINS. */
const OLLAMA_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"])

/** Whether Ollama answers a page at this origin as it comes, or needs OLLAMA_ORIGINS to name it. */
export function ollamaAllows(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (url.protocol === "http:" || url.protocol === "https:") && OLLAMA_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** "How much it can read at once", in tokens. A token is about three quarters of a word. */
export const CONTEXT_SIZES = [4000, 8000, 16000, 32000, 128000, 200000] as const

/** "8k tokens (about 6,000 words)". */
export function contextSizeLabel(tokens: number): string {
  const words = Math.round((tokens * 0.75) / 1000) * 1000
  return `${Math.round(tokens / 1000)}k tokens (about ${words.toLocaleString("en-US")} words)`
}
