import { getSchema } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import { flatText, leafText, locate, textBetween } from "./docText"

const schema = getSchema([
  StarterKit.configure({ undoRedo: false, code: false, codeBlock: false, link: false, trailingNode: false }),
])

const doc = () =>
  schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Mara ran" }] },
      { type: "horizontalRule" },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Jonas" }, { type: "hardBreak" }, { type: "text", text: "waited" }],
      },
    ],
  })

describe("document text for AI", () => {
  it("reads leaf text and block-separated ranges", () => {
    const node = doc()
    expect(leafText(schema.nodes.hardBreak.create())).toBe("\n")
    expect(leafText(schema.nodes.horizontalRule.create())).toBe("* * *")
    expect(textBetween(node, 0, node.content.size)).toBe("Mara ran\n\n* * *\n\nJonas\nwaited")
  })

  it("flattens text with positions and locates changed selections", () => {
    const node = doc()
    const flat = flatText(node)
    expect(flat.text).toBe("Mara ran\n\n* * *\n\nJonas\nwaited")
    const jonas = flat.text.indexOf("Jonas")
    expect(locate(node, "Jonas", flat.at[jonas], flat.at[jonas + 4] + 1)).toEqual({
      from: flat.at[jonas],
      to: flat.at[jonas + 4] + 1,
    })
    expect(locate(node, "Mara", 99, 100)).toEqual({ from: 1, to: 5 })
    expect(locate(node, "Missing", 1, 2)).toBeNull()
  })
})
