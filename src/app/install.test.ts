import { describe, expect, it } from "vitest"
import { appleWay } from "./install"

const macSafari = (version: string) =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} ` +
  "Safari/605.1.15"
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 " +
  "Safari/537.36"

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 " +
    "Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 " +
    "Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 " +
    "Mobile/15E148 Safari/604.1",
  macChrome: MAC_CHROME,
  macEdge: `${MAC_CHROME} Edg/140.0.0.0`,
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0",
  macDuckDuckGo: `${macSafari("18.5")} Ddg/18.5`,
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile " +
    "Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 " +
    "Edg/140.0.0.0",
}

describe("appleWay", () => {
  it("adds to the Home Screen on an iPhone or iPad, in any browser", () => {
    expect(appleWay(UA.iphoneSafari, 5)).toBe("home-screen")
    expect(appleWay(UA.iphoneChrome, 5)).toBe("home-screen")
    expect(appleWay(UA.ipadSafari, 5)).toBe("home-screen")
  })

  it("knows an iPad asking for pages as a Mac does by its touch screen", () => {
    expect(appleWay(macSafari("18.5"), 5)).toBe("home-screen")
    expect(appleWay(UA.macChrome, 5)).toBe("home-screen")
  })

  it("adds to the Dock from Safari 17 or later on a Mac", () => {
    expect(appleWay(macSafari("17.0"), 0)).toBe("dock")
    expect(appleWay(macSafari("26.0"), 0)).toBe("dock")
    expect(appleWay(macSafari("16.6"), 0)).toBeNull()
  })

  it("has no steps for other browsers on a Mac, which have their own way or none", () => {
    expect(appleWay(UA.macChrome, 0)).toBeNull()
    expect(appleWay(UA.macEdge, 0)).toBeNull()
    expect(appleWay(UA.macFirefox, 0)).toBeNull()
    expect(appleWay(UA.macDuckDuckGo, 0)).toBeNull()
  })

  it("has none away from Apple's devices", () => {
    expect(appleWay(UA.androidChrome, 5)).toBeNull()
    expect(appleWay(UA.windowsEdge, 10)).toBeNull()
  })
})
