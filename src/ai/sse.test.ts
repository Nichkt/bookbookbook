import { describe, expect, it } from "vitest"
import { createSseParser } from "./sse"

describe("createSseParser", () => {
  it("splits events across chunks, CRLF and comments", () => {
    const parser = createSseParser()
    expect(parser.push(": ignored\r\nevent: add\r\ndata: hel")).toEqual([])
    expect(parser.push("lo\r\ndata: world\r\n\r\n")).toEqual([{ event: "add", data: "hello\nworld" }])
    expect(parser.push("data: next\r")).toEqual([])
    expect(parser.push("\n\r\n")).toEqual([{ event: "message", data: "next" }])
  })

  it("returns done and trailing data without a final blank line", () => {
    const parser = createSseParser()
    expect(parser.push("data: [DONE]\n\n")).toEqual([{ event: "message", data: "[DONE]" }])
    parser.push("event: tail\ndata: still here")
    expect(parser.end()).toEqual([{ event: "tail", data: "still here" }])
  })
})
