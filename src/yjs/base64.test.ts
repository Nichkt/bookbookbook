import { describe, expect, it } from "vitest"
import { base64ToBytes, bytesToBase64 } from "./base64"

describe("base64", () => {
  it("round-trips every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it("round-trips data larger than one chunk", () => {
    const bytes = Uint8Array.from({ length: 100_003 }, (_, index) => (index * 7919) % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it("handles empty input", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("")
    expect(base64ToBytes("")).toEqual(new Uint8Array())
  })
})
