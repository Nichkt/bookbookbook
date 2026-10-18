import {
  isDictatingInto,
  startDictation,
  stopDictation,
  useDictation,
  type DictationTarget,
} from "./dictation"
import { onDeviceStatus, recognitionConstructor, speechVendor, sttEngine, type SttEngine } from "./engine"
import { openSpeechSetup, type SpeechSettings } from "./settings"

/**
 * What a Dictate button does: stops dictation into its box, or starts it there. Dictation that isn't set up yet, or
 * whose language pack is missing, opens the setup dialog first, which starts it once done.
 */
export async function toggleDictation(
  target: DictationTarget,
  settings: SpeechSettings,
  returnFocus: HTMLElement | null,
) {
  if (isDictatingInto(target.id)) {
    stopDictation()
    return
  }
  const Recognition = recognitionConstructor()
  const { engine, lang, commands } = settings
  if (!Recognition || !engine) {
    openSpeechSetup(target, returnFocus)
    return
  }
  if (engine === "on-device" && (await onDeviceStatus(lang, Recognition)) !== "available") {
    openSpeechSetup(target, returnFocus)
    return
  }
  startDictation(target, { engine, lang, commands }, Recognition)
}

/** The engine listening now, as a note records it. */
export function listeningEngine(): SttEngine | null {
  const { engine } = useDictation.getState()
  return engine && sttEngine(engine, speechVendor(navigator.userAgent))
}
