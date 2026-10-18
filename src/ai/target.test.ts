import { describe, expect, it } from "vitest"
import { BUILTIN_TOOLS } from "./tools"
import { aiShare, toolTarget } from "./target"

describe("tool targets", () => {
  it("describes cursor, selection and chapter targets", () => {
    expect(toolTarget(BUILTIN_TOOLS.find((tool) => tool.id === "continue")!, {}, {
      sceneName: "“Ferry wake”",
      selectedWords: 0,
      chapterName: "chapter 3",
    })).toBe("Writes at your cursor in “Ferry wake”.")
    expect(toolTarget(BUILTIN_TOOLS.find((tool) => tool.id === "names")!, {}, {
      sceneName: "“Ferry wake”",
      selectedWords: 0,
      chapterName: "chapter 3",
    })).toBe("Reads the names in your World, to avoid them.")
    expect(toolTarget(BUILTIN_TOOLS.find((tool) => tool.id === "rewrite")!, {}, {
      sceneName: null,
      selectedWords: 12,
      chapterName: null,
    })).toBe("Works on the 12 words you selected.")
    expect(toolTarget(BUILTIN_TOOLS.find((tool) => tool.id === "summarize")!, {}, {
      sceneName: null,
      selectedWords: 0,
      chapterName: "chapter 3",
    })).toBe("Reads all of chapter 3.")
  })

  it("formats AI share", () => {
    expect(aiShare(0, 10)).toBeNull()
    expect(aiShare(1000, 1)).toBe("under 1%")
    expect(aiShare(100, 125)).toBe("100%")
    expect(aiShare(100, -1)).toBe("0%")
  })
})
