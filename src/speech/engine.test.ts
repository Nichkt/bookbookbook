import { describe, expect, test } from "vitest"
import {
  commandsWork,
  defaultLang,
  installOnDevice,
  onDeviceStatus,
  speechVendor,
  sttEngine,
  sttEngineLabel,
  type RecognitionConstructor,
} from "./engine"

const UA = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 " +
    "Edg/140.0.0.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 " +
    "Safari/605.1.15",
  chromeOnIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 " +
    "Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile " +
    "Safari/537.36",
}

test("online recognition goes to the browser maker, or Apple on an iPhone", () => {
  expect(speechVendor(UA.chrome)).toBe("Google")
  expect(speechVendor(UA.android)).toBe("Google")
  expect(speechVendor(UA.edge)).toBe("Microsoft")
  expect(speechVendor(UA.safari)).toBe("Apple")
  expect(speechVendor(UA.chromeOnIphone)).toBe("Apple")
})

test("the language starts as the browser's, or the nearest listed, or US English", () => {
  expect(defaultLang(["en-GB", "en"])).toBe("en-GB")
  expect(defaultLang(["de"])).toBe("de-DE")
  expect(defaultLang(["es-AR"])).toBe("es-ES")
  expect(defaultLang(["xx-YY", "fr-CA"])).toBe("fr-FR")
  expect(defaultLang(["xx"])).toBe("en-US")
  expect(defaultLang([])).toBe("en-US")
  expect(commandsWork("en-AU")).toBe(true)
  expect(commandsWork("es-ES")).toBe(false)
})

describe("on the device", () => {
  const recognizer = (answer: () => Promise<string>, install?: () => Promise<boolean>) =>
    Object.assign(function Recognition() {}, { available: answer, install }) as unknown as RecognitionConstructor

  test("asks the browser whether it can recognize the language itself", async () => {
    expect(await onDeviceStatus("en-US", recognizer(() => Promise.resolve("downloadable")))).toBe("downloadable")
    expect(await onDeviceStatus("en-US", recognizer(() => Promise.resolve("available")))).toBe("available")
    expect(await onDeviceStatus("en-US", recognizer(() => Promise.resolve("maybe")))).toBe("unavailable")
    expect(await onDeviceStatus("en-US", recognizer(() => Promise.reject(new Error("no"))))).toBe("unsupported")
    expect(await onDeviceStatus("en-US", function Old() {} as unknown as RecognitionConstructor)).toBe("unsupported")
    expect(await onDeviceStatus("en-US", null)).toBe("unsupported")
  })

  test("installs the language pack where the browser can", async () => {
    const yes = () => Promise.resolve(true)
    const no = () => Promise.reject(new Error("no gesture"))
    expect(await installOnDevice("en-US", recognizer(() => Promise.resolve("downloadable"), yes))).toBe(true)
    expect(await installOnDevice("en-US", recognizer(() => Promise.resolve("downloadable"), no))).toBe(false)
    expect(await installOnDevice("en-US", null)).toBe(false)
  })
})

test("notes say which engine heard them", () => {
  expect(sttEngine("on-device", "Google")).toBe("on-device")
  expect(sttEngine("online", "Microsoft")).toBe("microsoft")
  expect(sttEngineLabel("on-device")).toBe("on this device")
  expect(sttEngineLabel("apple")).toBe("with Apple")
  expect(sttEngineLabel(null)).toBeNull()
  expect(sttEngineLabel("whisper")).toBeNull()
})
