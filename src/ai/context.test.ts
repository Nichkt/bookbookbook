import { describe, expect, it } from "vitest"
import {
  LOCKED_SLOTS,
  buildPrompt,
  budgetFor,
  cutEnd,
  cutStart,
  fillTemplate,
  parseSlotsOff,
  placeholdersIn,
  samplePassages,
  serializeSlotsOff,
  shortenText,
  slotDetail,
  slotsFor,
  unknownPlaceholders,
  worldItemText,
  type ContextInput,
} from "./context"
import { BUILTIN_TOOLS, customTool } from "./tools"

const book = {
  title: "The Tide Clock",
  genre: "Mystery",
  audience: "adult",
  pov: "first person",
  tense: "past tense",
  premise: "A keeper's daughter finds a ledger.",
  synopsis: "Storms and debts.",
  styleGuide: "Concrete, salt-stained prose.",
  samples: "One sample.\n\nTwo sample.",
}

const chapter = {
  label: "Chapter 2: The Ferry",
  summary: "Mara takes the ferry.",
  moments: [
    { text: "Board the ferry.", done: true },
    { text: "Find the hidden ledger.", done: false },
  ],
  next: "Find the hidden ledger.",
  pov: "Mara",
  present: ["Mara", "Jonas"],
  location: "Harbor",
}

const world = {
  id: "mara",
  name: "Mara",
  type: "Character",
  aliases: ["Mars"],
  fields: [["Voice & speech", "Short sentences."]] as const,
  notes: "Keeps the lighthouse.",
}

const baseInput = (patch: Partial<ContextInput> = {}): ContextInput => ({
  tool: BUILTIN_TOOLS.find((tool) => tool.id === "continue")!,
  fields: { length: "short", direction: "" },
  book,
  chapter,
  story: [{ label: "Chapter 1", summary: "Mara returns home." }],
  always: [world],
  mentioned: [{ ...world, id: "jonas", name: "Jonas", aliases: [], notes: "Owes money." }],
  voices: [{ name: "Mara", voice: "Dry and clipped." }],
  text: { before: "Before ".repeat(300), selection: "selected text", after: "After ".repeat(80), chapter: "Whole" },
  names: ["Mara", "Jonas"],
  slotsOff: new Set(),
  contextTokens: 4000,
  ...patch,
})

describe("context slots", () => {
  it("round-trips off slots but keeps locked slots on", () => {
    const off = parseSlotsOff(JSON.stringify(["story", "text", "book", "bad"]))
    expect(off).toEqual(new Set(["story"]))
    expect(serializeSlotsOff(new Set(["story", "text", "samples"]))).toBe(JSON.stringify(["story", "samples"]))
    expect([...LOCKED_SLOTS]).toEqual(["instructions", "book", "text"])
  })

  it("explains slot details", () => {
    expect(slotDetail({ id: "story", label: "Story", tokens: 0, items: 2, dropped: 0, off: true, locked: false, used: false }))
      .toBe("Off")
    expect(slotDetail({ id: "story", label: "Story", tokens: 1200, items: 3, dropped: 1, off: false, locked: false, used: true }))
      .toBe("~1.2k tokens, 1 of 3 left out to fit")
  })

  it("cuts text at readable boundaries and samples passages", () => {
    expect(cutStart("alpha beta gamma delta", 11)).toBe("…delta")
    expect(cutEnd("alpha beta gamma delta", 12)).toBe("alpha beta…")
    expect(samplePassages(" One \n\n \nTwo ")).toEqual(["One", "Two"])
    expect(worldItemText({ ...world, notes: "x".repeat(3000) })).toContain("…")
    expect(shortenText({ before: "b".repeat(800), after: "a".repeat(300), selection: "sel", chapter: "c".repeat(1500) }, 500))
      .toMatchObject({ after: "", selection: "sel" })
  })

  it("builds prompts, trims low-priority slots and honors off slots", () => {
    const prompt = buildPrompt(
      baseInput({
        slotsOff: new Set(["story", "samples"]),
        contextTokens: 900,
      }),
    )
    expect(prompt.user).toContain("# About the book")
    expect(prompt.user).toContain("<text_before_caret>")
    expect(prompt.user).not.toContain("# Story so far")
    expect(prompt.user).not.toContain("# The author's style")
    expect(prompt.budget).toBe(budgetFor(900, prompt.maxTokens))
    expect(prompt.trimmed).toBe(true)
    expect(prompt.slots.find((slot) => slot.id === "story")?.off).toBe(true)
  })

  it("custom tools fill only requested placeholders and report unknown ones", () => {
    const tool = customTool({
      id: "mine",
      name: "Mine",
      prompt_template: "Use {selection} with {summary} and {codex}. Keep {unknown}.",
      output_mode: "list",
    })
    expect(slotsFor(tool)).toEqual(["instructions", "book", "text", "chapter", "always", "mentioned"])
    expect(placeholdersIn("{Selection} {beats} {codex}")).toEqual(new Set(["selection", "moments", "world"]))
    expect(unknownPlaceholders("{words} {World}")).toEqual(["{words}"])
    expect(fillTemplate("{beats} {codex} {left}", { moments: "m", world: "w" })).toBe("m w {left}")
    const prompt = buildPrompt(baseInput({ tool, fields: {}, text: { before: "", selection: "Pick me", after: "", chapter: "" } }))
    expect(prompt.user).toContain("Pick me")
    expect(prompt.user).toContain("Mara")
    expect(prompt.user).toContain("Mara takes the ferry.")
    expect(prompt.user).not.toContain("Concrete, salt-stained prose.")
  })
})
