import { describe, expect, it } from "vitest"
import { cleanProse, ideaName, ideaParts, parseFeedback, parseList, parseNames, parseSenses, parseSummary } from "./parse"

describe("AI output parsers", () => {
  it("cleans prose wrappers but keeps intentional leading line breaks", () => {
    expect(cleanProse("<think>notes</think>\n```text\nHere's the continuation:\n<selected_text>Mara ran.</selected_text>\n```")).toBe(
      "Mara ran.",
    )
    expect(cleanProse("\nA line that starts after a break.")).toBe("\nA line that starts after a break.")
  })

  it("parses lists and grouped senses or feedback from messy markdown", () => {
    expect(parseList("1. **First** idea\ncontinues\n\n- Second idea")).toEqual(["First idea continues", "Second idea"])
    expect(parseSenses("Sight: - lanterns swing\nSound:\n- chains knock\nMetaphors: a black mouth")).toEqual([
      { heading: "Sight", items: ["lanterns swing"] },
      { heading: "Sound", items: ["chains knock"] },
      { heading: "Metaphor", items: ["a black mouth"] },
    ])
    expect(parseFeedback("Pacing:\n- Cut the ferry wait.\nCharacter: Mara wants more.")).toEqual([
      { heading: "Pacing", items: ["Cut the ferry wait."] },
      { heading: "Character", items: ["Mara wants more."] },
    ])
  })

  it("parses names, idea names and chapter summaries", () => {
    expect(parseNames("1. Bryn Calloway — sharp, old money\n* Mara: already in trouble")).toEqual([
      { name: "Bryn Calloway", note: "sharp, old money" },
      { name: "Mara", note: "already in trouble" },
    ])
    expect(ideaParts("Wren: a ferry pilot with debts")).toEqual({ name: "Wren", note: "a ferry pilot with debts" })
    expect(ideaName("No named start here. Just prose.")).toBeNull()
    expect(parseSummary("Summary: Mara steals the ledger.\nMoments:\n- She lies.\n- Jonas follows.")).toEqual({
      summary: "Mara steals the ledger.",
      moments: ["She lies.", "Jonas follows."],
    })
  })
})
