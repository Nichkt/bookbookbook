import { describe, expect, it } from "vitest"
import { fold, mergeCommands, scoreCommand, searchCommands, type PaletteCommand, type PaletteGroup } from "./commands"

function command(label: string, group: PaletteGroup = "Actions", extra: Partial<PaletteCommand> = {}): PaletteCommand {
  return { id: `${group}:${label}`, label, group, run: () => {}, ...extra }
}

const labels = (commands: readonly PaletteCommand[], query: string) =>
  searchCommands(commands, query).map(({ group, commands: found }) => [group, found.map(({ label }) => label)])

describe("fold", () => {
  it("drops case and accents", () => {
    expect(fold("Zoë ÉCLAIR")).toBe("zoe eclair")
  })
})

describe("scoreCommand", () => {
  it("ranks the start of the label, then the start of its words, then anywhere in it", () => {
    expect(scoreCommand(command("Focus mode"), "foc")).toBe(8)
    expect(scoreCommand(command("Leave focus mode"), "focus")).toBe(7)
    expect(scoreCommand(command("Typewriter scrolling"), "writer")).toBe(4)
    expect(scoreCommand(command("Focus mode"), "xyz")).toBe(0)
  })

  it("takes the words in any order, and skips accents and punctuation", () => {
    expect(scoreCommand(command("Focus mode"), "mode focus")).toBe(7)
    expect(scoreCommand(command("Zoë Marsh"), "zoe")).toBe(8)
    expect(scoreCommand(command("Add to World…"), "world")).toBe(7)
    expect(scoreCommand(command("Focus mode"), "  FOCUS   mo ")).toBe(8)
  })

  it("counts a keyword less than the start of a word in the label, but more than letters inside one", () => {
    const chapter = command("3. The Salt Road", "Chapters", { keywords: ["The Salt Road", "Chapter 3"] })
    expect(scoreCommand(chapter, "chapter 3")).toBe(6)
    expect(scoreCommand(command("Glossary", "Help", { keywords: ["Words", "Terms"] }), "term")).toBe(6)
    expect(scoreCommand(command("Glossary", "Help", { keywords: ["What words mean"] }), "mean")).toBe(5)
    expect(scoreCommand(chapter, "salt")).toBe(7)
    expect(scoreCommand(chapter, "3")).toBe(8)
    expect(scoreCommand(command("Typewriter", "Actions", { keywords: ["scrolling"] }), "roll")).toBe(3)
  })

  it("matches words split across the label and keywords least of all", () => {
    expect(scoreCommand(command("Dark theme", "Appearance", { keywords: ["night"] }), "dark night")).toBe(2)
  })

  it("scores a lesser command a step below, but still finds it", () => {
    expect(scoreCommand(command("Outline", "Help", { lesser: true }), "outline")).toBe(7)
    expect(scoreCommand(command("Dark theme", "Help", { keywords: ["night"], lesser: true }), "dark night")).toBe(1)
  })

  it("matches nothing when nothing's typed", () => {
    expect(scoreCommand(command("Focus mode"), "   ")).toBe(0)
  })
})

describe("searchCommands", () => {
  const commands = [
    command("Glossary", "Help"),
    command("Focus mode"),
    command("1. Fog on the River", "Chapters", { searchOnly: true }),
    command("Find and replace"),
    command("Dark theme", "Appearance"),
  ]

  it("lists what isn't search-only, in the groups' order, before anything's typed", () => {
    expect(labels(commands, "")).toEqual([
      ["Actions", ["Focus mode", "Find and replace"]],
      ["Help", ["Glossary"]],
      ["Appearance", ["Dark theme"]],
    ])
    expect(labels(commands, "  ")).toEqual(labels(commands, ""))
  })

  it("finds search-only commands, the group with the best match first and the best match first in it", () => {
    expect(labels(commands, "f")).toEqual([
      ["Actions", ["Focus mode", "Find and replace"]],
      ["Chapters", ["1. Fog on the River"]],
    ])
    expect(labels(commands, "fog")).toEqual([["Chapters", ["1. Fog on the River"]]])
    expect(labels([command("Replace all"), command("Find and replace")], "replace")).toEqual([
      ["Actions", ["Replace all", "Find and replace"]],
    ])
  })

  it("puts a better match in a later group first", () => {
    const found = labels([command("Show the World panel"), command("World", "Go to")], "world")
    expect(found).toEqual([
      ["Go to", ["World"]],
      ["Actions", ["Show the World panel"]],
    ])
  })

  it("puts a view before a page and a glossary term with the same word", () => {
    const found = labels(
      [
        command("Outline", "Help", { searchOnly: true, lesser: true }),
        command("Plan", "Go to", { keywords: ["outline"] }),
        command("Plan: Outline", "Go to", { searchOnly: true }),
      ],
      "outline",
    )
    expect(found).toEqual([
      ["Go to", ["Plan: Outline", "Plan"]],
      ["Help", ["Outline"]],
    ])
  })
})

describe("mergeCommands", () => {
  it("keeps the first command with an id, so a screen's comes before the app's and takes its place", () => {
    const merged = mergeCommands(
      [command("Leave focus mode", "Actions", { id: "focus" }), command("Find", "Actions", { id: "find" })],
      [command("Quick note", "Actions", { id: "note" }), command("Focus mode", "Actions", { id: "focus" })],
    )
    expect(merged.map(({ label }) => label)).toEqual(["Leave focus mode", "Find", "Quick note"])
  })
})
