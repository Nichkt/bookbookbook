import { describe, expect, it } from "vitest"
import {
  BUILTIN_TOOLS,
  PLACEHOLDER_ALIASES,
  PLACEHOLDERS,
  TOOL_GROUPS,
  customTool,
  fieldShown,
  fieldValues,
  isOutputMode,
  parseToolPref,
  toolById,
  usesSelection,
} from "./tools"

describe("tools", () => {
  it("keeps built-ins unique, grouped and worded with cursor", () => {
    expect(new Set(BUILTIN_TOOLS.map((tool) => tool.id)).size).toBe(BUILTIN_TOOLS.length)
    for (const tool of BUILTIN_TOOLS) {
      expect(TOOL_GROUPS).toContain(tool.group)
      expect(tool.blurb).not.toMatch(/\bcaret\b/i)
    }
    expect(BUILTIN_TOOLS.map((tool) => tool.blurb).join("\n")).toMatch(/\bcursor\b/i)
  })

  it("turns custom tool rows into tool definitions", () => {
    const tool = customTool({
      id: "mine",
      name: "  My prompt ",
      prompt_template: "Rewrite {selection}",
      output_mode: "long",
    })
    expect(tool).toMatchObject({
      id: "custom:mine",
      name: "My prompt",
      group: "Your tools",
      blurb: "One long draft",
      input: "selection",
      output: "prose",
      variants: 1,
      placement: "replace",
    })
    expect(toolById("custom:mine", [tool])).toBe(tool)
    expect(toolById("missing", [tool])).toBeUndefined()
  })

  it("normalizes fields and the tool preference", () => {
    const rewrite = BUILTIN_TOOLS.find((tool) => tool.id === "rewrite")!
    expect(fieldValues(rewrite, { preset: "custom", instruction: "shorter" })).toEqual({
      preset: "custom",
      instruction: "shorter",
    })
    expect(fieldValues(rewrite, { preset: "bad" }).preset).toBe("rephrase")
    expect(fieldShown(rewrite.fields[1], { preset: "custom" })).toBe(true)
    expect(fieldShown(rewrite.fields[1], { preset: "rephrase" })).toBe(false)
    expect(parseToolPref("junk")).toEqual({ tool: BUILTIN_TOOLS[0].id, fields: {} })
    expect(parseToolPref(JSON.stringify({ tool: "names", fields: { names: { kind: "places", n: 3 } } }))).toEqual({
      tool: "names",
      fields: { names: { kind: "places" } },
    })
  })

  it("knows output modes, selection use and placeholders", () => {
    expect(isOutputMode("list")).toBe(true)
    expect(isOutputMode("other")).toBe(false)
    expect(usesSelection("Use {selection}")).toBe(true)
    expect(usesSelection("Use {Selection}")).toBe(true)
    expect(PLACEHOLDERS.map((placeholder) => placeholder.name)).toContain("world")
    expect(PLACEHOLDER_ALIASES).toEqual({ beats: "moments", codex: "world" })
  })
})
