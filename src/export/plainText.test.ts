import { describe, expect, it } from "vitest"
import { br, list, para, quote, sceneBreak, text } from "@/test/blocks"
import { blocksToText } from "./plainText"

describe("blocksToText", () => {
  it("sets blocks apart by a blank line, and marks scene breaks", () => {
    expect(blocksToText([para(text("One.")), sceneBreak, para(text("Two."), br, text("Still two."))])).toBe(
      "One.\n\n* * *\n\nTwo.\nStill two.",
    )
  })

  it("drops trailing spaces, line breaks at either end and empty paragraphs", () => {
    expect(blocksToText([para(br, text("Spaced  "), br, br), para(), para(text("Next."))])).toBe("Spaced\n\nNext.")
  })

  it("indents quotes, but not the blank lines inside them", () => {
    expect(blocksToText([quote(para(text("Salt keeps.")), para(text("So do ledgers.")))])).toBe(
      "    Salt keeps.\n\n    So do ledgers.",
    )
  })

  it("marks list items, and lines up what follows a marker", () => {
    expect(blocksToText([list(false, [[para(text("one"))], [para(text("two"))]])])).toBe("• one\n• two")
    expect(
      blocksToText([list(true, [[para(text("a")), para(text("more"))], [para(text("b")), list(false, [[para(text("c"))]])]], 9)]),
    ).toBe("9. a\n\n   more\n\n10. b\n\n    • c")
    expect(blocksToText([list(true, [[], [para(text("x"))]], -3)])).toBe("0.\n1. x")
  })
})
