/*
 * The browser's speech recognition (DESIGN.md §10 "Engines"). Chrome 139 and later can recognize speech on the device
 * once it has the language's pack. Otherwise recognition sends the sound to the browser maker's servers, which the
 * writer agrees to first. Firefox has none.
 */

/** Where speech becomes text: here, or on the servers of the company that makes the browser. */
export type EngineKind = "on-device" | "online"

/** Whose servers a browser's online recognition uses. */
export type Vendor = "Google" | "Microsoft" | "Apple"

/** Whether the device can recognize a language itself, as Chrome says, or "unsupported" where the browser can't say. */
export type OnDeviceStatus = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported"

const STATUSES: readonly OnDeviceStatus[] = ["available", "downloadable", "downloading", "unavailable"]

interface RecognitionOptions {
  langs: string[]
  processLocally: boolean
}

export interface RecognitionAlternative {
  transcript: string
}

export interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: RecognitionAlternative
}

export interface RecognitionResultEvent {
  resultIndex: number
  results: { readonly length: number; readonly [index: number]: RecognitionResult }
}

/** What the app uses of the browser's SpeechRecognition. */
export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally?: boolean
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export interface RecognitionConstructor {
  new (): Recognition
  available?(options: RecognitionOptions): Promise<string>
  install?(options: RecognitionOptions): Promise<boolean>
}

/** The browser's SpeechRecognition, prefixed in Chrome and Safari, or null without one. */
export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null
  const speech = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null
}

/** Whose servers online recognition goes to: every browser on an iPhone or iPad uses Apple's. */
export function speechVendor(userAgent: string): Vendor {
  if (/iPhone|iPad|iPod/u.test(userAgent)) return "Apple"
  if (/\bEdg(?:e|A|iOS)?\//u.test(userAgent)) return "Microsoft"
  if (/Safari\//u.test(userAgent) && !/Chrome|Chromium|Android/u.test(userAgent)) return "Apple"
  return "Google"
}

/** Whether the device can recognize `lang` itself, or could once it has the language pack. */
export async function onDeviceStatus(
  lang: string,
  recognition = recognitionConstructor(),
): Promise<OnDeviceStatus> {
  if (typeof recognition?.available !== "function") return "unsupported"
  try {
    const status = await recognition.available({ langs: [lang], processLocally: true })
    return STATUSES.find((known) => known === status) ?? "unavailable"
  } catch {
    return "unsupported"
  }
}

/** Downloads the language pack for recognizing `lang` on the device. Must run from a click. */
export async function installOnDevice(lang: string, recognition = recognitionConstructor()): Promise<boolean> {
  if (typeof recognition?.install !== "function") return false
  try {
    return await recognition.install({ langs: [lang], processLocally: true })
  } catch {
    return false
  }
}

/** The languages to choose from, with English names. Chrome can recognize most of them on the device. */
export const LANGUAGES: readonly { code: string; name: string }[] = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "en-AU", name: "English (Australia)" },
  { code: "en-CA", name: "English (Canada)" },
  { code: "en-IN", name: "English (India)" },
  { code: "de-DE", name: "German" },
  { code: "es-ES", name: "Spanish (Spain)" },
  { code: "es-MX", name: "Spanish (Mexico)" },
  { code: "fr-FR", name: "French" },
  { code: "it-IT", name: "Italian" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "nl-NL", name: "Dutch" },
  { code: "pl-PL", name: "Polish" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "pt-PT", name: "Portuguese (Portugal)" },
  { code: "ru-RU", name: "Russian" },
  { code: "sv-SE", name: "Swedish" },
  { code: "tr-TR", name: "Turkish" },
  { code: "zh-CN", name: "Chinese (Mandarin)" },
]

/** The listed language closest to the browser's: the same one, else the first in the same language, else US English. */
export function defaultLang(browser: readonly string[]): string {
  for (const wanted of browser) {
    const exact = LANGUAGES.find((lang) => lang.code.toLowerCase() === wanted.toLowerCase())
    if (exact) return exact.code
    const base = wanted.split("-")[0].toLowerCase()
    const same = LANGUAGES.find((lang) => lang.code.split("-")[0].toLowerCase() === base)
    if (same) return same.code
  }
  return "en-US"
}

/** Voice commands are English words. */
export const commandsWork = (lang: string) => /^en\b/iu.test(lang)

/** What notes keep in `stt_engine`: which engine heard them. */
export type SttEngine = "on-device" | "google" | "microsoft" | "apple"

export const sttEngine = (engine: EngineKind, vendor: Vendor): SttEngine =>
  engine === "on-device" ? "on-device" : (vendor.toLowerCase() as SttEngine)

/** "on this device", "with Google": how a note says it was heard. */
export function sttEngineLabel(engine: string | null): string | null {
  switch (engine) {
    case "on-device":
      return "on this device"
    case "google":
      return "with Google"
    case "microsoft":
      return "with Microsoft"
    case "apple":
      return "with Apple"
    default:
      return null
  }
}
