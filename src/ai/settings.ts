import type { Db, Tx } from "@/db/tx"
import { isProviderId, PROVIDERS, type ProviderId, type ProviderInfo } from "./providers"

/*
 * The AI settings (DESIGN.md §9), all device-only: which provider, its model, address and how much it reads, in
 * `ui_prefs`; API keys in `provider_keys`, which never syncs and isn't in backups.
 */

export const AI_SETTINGS_PREF = "ai.settings"
/** "off" hides the tint on AI-written text (DESIGN.md §8 "Provenance and stats"). The text keeps its mark. */
export const AI_TINT_PREF = "ai.tint"
/** The context slots the writer turned off, as a JSON array (see context.ts). */
export const AI_SLOTS_PREF = "ai.slots"
/** The tool the panel shows, and what was last chosen in each tool's fields, as JSON. */
export const AI_TOOL_PREF = "ai.tool"

export interface ProviderChoice {
  model: string
  baseUrl: string
  /** How much the AI reads at once, in tokens: the model's limit, or a cap on what each request costs. */
  contextTokens: number
}

export interface AiSettings {
  /** Where requests go; null until the writer sets the AI tools up. */
  provider: ProviderId | null
  /** What the writer chose for each provider they've tried, so switching back keeps it. */
  choices: Partial<Record<ProviderId, ProviderChoice>>
}

export const NO_AI_SETTINGS: AiSettings = { provider: null, choices: {} }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function parseAiSettings(raw: string | null | undefined): AiSettings {
  if (!raw) return NO_AI_SETTINGS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return NO_AI_SETTINGS
  }
  if (!isRecord(value)) return NO_AI_SETTINGS
  const choices: Partial<Record<ProviderId, ProviderChoice>> = {}
  if (isRecord(value.choices)) {
    for (const [id, choice] of Object.entries(value.choices)) {
      if (!isProviderId(id) || !isRecord(choice)) continue
      const fallback = defaultChoice(id)
      const tokens = choice.contextTokens
      choices[id] = {
        model: typeof choice.model === "string" ? choice.model : fallback.model,
        baseUrl: typeof choice.baseUrl === "string" && choice.baseUrl.trim() ? choice.baseUrl : fallback.baseUrl,
        contextTokens:
          typeof tokens === "number" && Number.isInteger(tokens) && tokens >= 1000 ? tokens : fallback.contextTokens,
      }
    }
  }
  return { provider: isProviderId(value.provider) ? value.provider : null, choices }
}

const defaultChoice = (id: ProviderId): ProviderChoice => ({
  model: PROVIDERS[id].models[0] ?? "",
  baseUrl: PROVIDERS[id].baseUrl,
  contextTokens: PROVIDERS[id].contextTokens,
})

/** The model, address and size for a provider: the writer's, else the provider's defaults. */
export const choiceFor = (settings: AiSettings, id: ProviderId): ProviderChoice =>
  settings.choices[id] ?? defaultChoice(id)

export const withChoice = (settings: AiSettings, id: ProviderId, patch: Partial<ProviderChoice>): AiSettings => ({
  ...settings,
  choices: { ...settings.choices, [id]: { ...choiceFor(settings, id), ...patch } },
})

/** Everything a request needs to reach a model. */
export interface Connection {
  provider: ProviderInfo
  model: string
  baseUrl: string
  contextTokens: number
  /** Null when there's none: a model on this computer needs none. */
  key: string | null
}

export function isWebAddress(text: string): boolean {
  try {
    const url = new URL(text.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** What's missing before a request can go, as an instruction; null when nothing is. */
export function setupProblem(settings: AiSettings, keys: ReadonlyMap<string, string>): string | null {
  if (!settings.provider) return "Choose where the AI runs."
  const provider = PROVIDERS[settings.provider]
  const choice = choiceFor(settings, provider.id)
  if (provider.keyUrl && !keys.get(provider.id)?.trim()) return `Add your ${provider.name} API key.`
  if (!isWebAddress(choice.baseUrl)) return "Check the address: it should start with http:// or https://."
  if (!choice.model.trim()) return "Choose a model."
  return null
}

/** The connection requests use, or null while setupProblem has something to say. */
export function connectionOf(settings: AiSettings, keys: ReadonlyMap<string, string>): Connection | null {
  if (!settings.provider || setupProblem(settings, keys)) return null
  const provider = PROVIDERS[settings.provider]
  const choice = choiceFor(settings, provider.id)
  return {
    provider,
    model: choice.model.trim(),
    baseUrl: choice.baseUrl.trim().replace(/\/+$/, ""),
    contextTokens: choice.contextTokens,
    key: keys.get(provider.id)?.trim() || null,
  }
}

/** "OpenAI · gpt-5.4-mini": where a request goes, as the panel and each card say (DESIGN.md §9 "Privacy rules"). */
export const routeLabel = (provider: ProviderId, model: string) => `${PROVIDERS[provider].name} · ${model}`

export interface KeyRow {
  id: string
  secret: string | null
}

/** Keys by provider id. */
export const KEYS_SQL = "SELECT id, secret FROM provider_keys"

export function keyMap(rows: readonly KeyRow[]): Map<string, string> {
  return new Map(rows.flatMap((row) => (row.secret ? [[row.id, row.secret] as const] : [])))
}

export async function readKeys(db: Tx): Promise<Map<string, string>> {
  return keyMap(await db.getAll<KeyRow>(KEYS_SQL))
}

/** Saves a provider's key on this device. Upserts can't run through PowerSync's views, so check for the row first. */
export async function saveKey(db: Db, provider: ProviderId, secret: string) {
  const trimmed = secret.trim()
  const label = `${PROVIDERS[provider].name} key ending ${trimmed.slice(-4)}`
  await db.writeTransaction(async (tx) => {
    if (await tx.getOptional("SELECT id FROM provider_keys WHERE id = ?", [provider])) {
      await tx.execute("UPDATE provider_keys SET secret = ?, label = ? WHERE id = ?", [trimmed, label, provider])
    } else {
      await tx.execute("INSERT INTO provider_keys (id, provider, label, secret, created_at) VALUES (?, ?, ?, ?, ?)", [
        provider,
        provider,
        label,
        trimmed,
        new Date().toISOString(),
      ])
    }
  })
}

export async function forgetKey(db: Db, provider: ProviderId) {
  await db.execute("DELETE FROM provider_keys WHERE id = ?", [provider])
}

/** "••••3f9a": enough of a key to tell which it is. */
export const maskedKey = (secret: string) => `••••${secret.trim().slice(-4)}`
