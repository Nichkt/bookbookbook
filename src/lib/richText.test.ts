import { describe, expect, it } from "vitest"
import { plainToRichText, richTextToPlain } from "./richText"

describe("rich-text notes", () => {
  it("round-trips plain text, a paragraph per line, blank lines included", () => {
    const text = "First line.\n\nAfter a gap.\nNext."
    expect(richTextToPlain(plainToRichText(text))).toBe(text)
    expect(JSON.parse(plainToRichText("a\n\nb")).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ])
  })

  it("reads an empty doc, or nothing, as no text", () => {
    expect(richTextToPlain(plainToRichText(""))).toBe("")
    expect(richTextToPlain(null)).toBe("")
    expect(richTextToPlain(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }))).toBe("")
  })

  it("flattens richer docs: marks, hard breaks, headings, lists and quotes", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Voice" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Dry", marks: [{ type: "italic" }] },
            { type: "hardBreak" },
            { type: "text", text: "and wry" },
          ],
        },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] },
      ],
    }
    expect(richTextToPlain(JSON.stringify(doc))).toBe("Voice\nDry\nand wry\none\nquoted")
  })

  it("reads text that isn't a doc as itself", () => {
    expect(richTextToPlain("Just words")).toBe("Just words")
    expect(richTextToPlain('"quoted"')).toBe('"quoted"')
    expect(richTextToPlain("42")).toBe("42")
  })
})
