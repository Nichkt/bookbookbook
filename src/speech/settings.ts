import { useQuery } from "@powersync/react"
import { create } from "zustand"
import { setPref } from "@/db/prefs"
import type { Db } from "@/db/tx"
import type { DictationTarget } from "./dictation"
import { defaultLang, type EngineKind } from "./engine"

/*
 * Dictation's settings, per device (DESIGN.md §10): where speech becomes text, the language spoken, and whether
 * voice commands are on. Until the writer sets dictation up, the first Dictate opens the setup dialog.
 */

export const SPEECH_ENGINE_PREF = "speech.engine"
export const SPEECH_LANG_PREF = "speech.lang"
export const SPEECH_COMMANDS_PREF = "speech.commands"

export interface SpeechSettings {
  /** Null until dictation is set up on this device. */
  engine: EngineKind | null
  lang: string
  commands: boolean
}

export const parseEngine = (value: string | null | undefined): EngineKind | null =>
  value === "on-device" || value === "online" ? value : null

const browserLangs = () =>
  typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]

export function parseSpeechSettings(values: ReadonlyMap<string, string | null>): SpeechSettings {
  return {
    engine: parseEngine(values.get(SPEECH_ENGINE_PREF)),
    lang: values.get(SPEECH_LANG_PREF) || defaultLang(browserLangs()),
    commands: values.get(SPEECH_COMMANDS_PREF) !== "off",
  }
}

const SETTINGS_SQL = "SELECT id, value FROM ui_prefs WHERE id IN (?, ?, ?)"
const SETTINGS_PARAMS = [SPEECH_ENGINE_PREF, SPEECH_LANG_PREF, SPEECH_COMMANDS_PREF]

type PrefRow = { id: string; value: string | null }

export function useSpeechSettings(): SpeechSettings & { isLoading: boolean } {
  const { data, isLoading } = useQuery<PrefRow>(SETTINGS_SQL, SETTINGS_PARAMS)
  return { ...parseSpeechSettings(new Map(data.map((row) => [row.id, row.value]))), isLoading }
}

/** The settings as they are now: for a keyboard shortcut, which has no query to wait on. */
export async function readSpeechSettings(db: Db): Promise<SpeechSettings> {
  const rows = await db.getAll<PrefRow>(SETTINGS_SQL, SETTINGS_PARAMS)
  return parseSpeechSettings(new Map(rows.map((row) => [row.id, row.value])))
}

export async function saveSpeechSettings(db: Db, settings: SpeechSettings & { engine: EngineKind }) {
  await setPref(db, SPEECH_ENGINE_PREF, settings.engine)
  await setPref(db, SPEECH_LANG_PREF, settings.lang)
  await setPref(db, SPEECH_COMMANDS_PREF, settings.commands ? "on" : "off")
}

interface SpeechSetupState {
  open: boolean
  /** Bumped each time the dialog opens, so its form starts afresh. */
  session: number
  /** The box to dictate into once it's set up, when a Dictate button opened it. */
  target: DictationTarget | null
  returnFocus: HTMLElement | null
}

export const useSpeechSetup = create<SpeechSetupState>(() => ({
  open: false,
  session: 0,
  target: null,
  returnFocus: null,
}))

export function openSpeechSetup(target: DictationTarget | null, returnFocus: HTMLElement | null) {
  useSpeechSetup.setState((state) => ({ open: true, session: state.session + 1, target, returnFocus }))
}

export const closeSpeechSetup = () => useSpeechSetup.setState({ open: false })
