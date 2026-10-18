import { Schema } from "@tiptap/pm/model"
import { AllSelection, EditorState, TextSelection } from "@tiptap/pm/state"
import { describe, expect, test } from "vitest"
import { buildMentionMatcher } from "@/editor/mentions"
import {
  aliasSuggestions,
  defaultTypeId,
  entryNamed,
  isCapitalized,
  looksLikeName,
  namesAnEntry,
  openAddToWorldWith,
  offersToAdd,
  selectedName,
  tidyName,
  useAddToWorld,
} from "./addToWorld"

const matcher = buildMentionMatcher([
  { id: "mara", name: "Mara Quill", aliases: ["Mara"] },
  { id: "light", name: "Grayhaven Light", aliases: [] },
  { id: "island", name: "Grayhaven", aliases: [] },
])

describe("a selection as a name", () => {
  test("loses the quotes, punctuation and possessive around it, and its line breaks", () => {
    expect(tidyName("Mara's,")).toBe("Mara")
    expect(tidyName("“Grayhaven Light”")).toBe("Grayhaven Light")
    expect(tidyName("(Elias)")).toBe("Elias")
    expect(tidyName("Jonas’")).toBe("Jonas")
    expect(tidyName("  the\n Salt  Ledger. ")).toBe("the Salt Ledger")
    expect(tidyName("Dr. Penhallow")).toBe("Dr. Penhallow")
  })

  test("is a few words with a letter in, and no sentence punctuation", () => {
    expect(looksLikeName("Mara")).toBe(true)
    expect(looksLikeName("Salt Ledger")).toBe(true)
    expect(looksLikeName("Jo")).toBe(true)
    expect(looksLikeName("M")).toBe(false)
    expect(looksLikeName("1984")).toBe(false)
    expect(looksLikeName("Mara, Jonas")).toBe(false)
    expect(looksLikeName("a b c d e f")).toBe(true)
    expect(looksLikeName("a b c d e f g")).toBe(false)
    expect(looksLikeName("x".repeat(61))).toBe(false)
  })

  test("is written as names are: a word starts with a capital, or the script has no small letters", () => {
    expect(isCapitalized("Mara")).toBe(true)
    expect(isCapitalized("the Salt Ledger")).toBe(true)
    expect(isCapitalized("東京")).toBe(true)
    expect(isCapitalized("harbor")).toBe(false)
  })
})

describe("the name selected in the text", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "paragraph+" },
      paragraph: { content: "inline*" },
      text: { group: "inline" },
    },
  })
  // "Mara's" is at 1–7; the second paragraph starts at 29.
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("Mara's ledger, Jonas said.")]),
    schema.node("paragraph", null, [schema.text("Grayhaven Light")]),
  ])
  const select = (from: number, to: number) => EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })

  test("is the selection tidied, when it looks like a name", () => {
    expect(selectedName(select(1, 8))).toBe("Mara")
    expect(selectedName(select(29, 44))).toBe("Grayhaven Light")
  })

  test("is nothing for no selection, one across paragraphs, or one that isn't a name", () => {
    expect(selectedName(select(3, 3))).toBe("")
    expect(selectedName(select(16, 34))).toBe("")
    expect(selectedName(select(1, 22))).toBe("")
    expect(selectedName(EditorState.create({ doc, selection: new AllSelection(doc) }))).toBe("")
  })
})

describe("offering to add a name", () => {
  test("is for names the text doesn't link to an entry yet", () => {
    expect(offersToAdd(matcher, "Elias Penhallow")).toBe(true)
    expect(offersToAdd(matcher, "Mara Penhallow")).toBe(true)
    expect(offersToAdd(matcher, "Mara")).toBe(false)
    expect(offersToAdd(matcher, "Grayhaven Light")).toBe(false)
  })

  test("is not for words written small, or ones that open sentences, though some of those are names too", () => {
    expect(offersToAdd(matcher, "")).toBe(false)
    expect(offersToAdd(matcher, "harbor")).toBe(false)
    expect(offersToAdd(matcher, "The")).toBe(false)
    expect(offersToAdd(matcher, "When")).toBe(false)
    expect(offersToAdd(matcher, "Will")).toBe(true)
    expect(offersToAdd(matcher, "The Harbor Guild")).toBe(true)
  })

  test("an entry's name is one the text links in full to that entry", () => {
    expect(namesAnEntry(matcher, "Mara Quill")).toBe(true)
    expect(namesAnEntry(matcher, "Grayhaven")).toBe(true)
    expect(namesAnEntry(matcher, "Mara and Grayhaven")).toBe(false)
    expect(namesAnEntry(matcher, "Marabel")).toBe(false)
  })
})

describe("the dialog", () => {
  test("finds the entry already called a name, by its name or an alias, whatever the case", () => {
    const mara = { name: "Mara Quill", named: true, aliases: ["Mara"] }
    // Its name is a description, which the text never links.
    const order = { name: "The keepers' order", named: false, aliases: ["the Order"] }
    expect(entryNamed([mara, order], " mara quill ")).toBe(mara)
    expect(entryNamed([mara, order], "MARA")).toBe(mara)
    expect(entryNamed([mara, order], "The Order")).toBe(order)
    expect(entryNamed([mara, order], "The keepers' order")).toBeUndefined()
    expect(entryNamed([mara, order], "  ")).toBeUndefined()
  })

  test("suggests the shorter names the text might use, without linking words or titles", () => {
    expect(aliasSuggestions("Jonas Quill")).toEqual(["Jonas", "Quill"])
    expect(aliasSuggestions("Dr. Elias Penhallow")).toEqual(["Elias", "Penhallow"])
    expect(aliasSuggestions("Ludwig van Beethoven")).toEqual(["Ludwig", "Beethoven"])
    expect(aliasSuggestions("The Harbor Guild")).toEqual(["Harbor", "Guild"])
    expect(aliasSuggestions("Anna Anna")).toEqual(["Anna"])
    expect(aliasSuggestions("Mara")).toEqual([])
    expect(aliasSuggestions("A B")).toEqual([])
  })

  test("offers first the preferred key, then last used, else Characters, else the first there is", () => {
    const types = [
      { id: "places", key: "locations" },
      { id: "people", key: "characters" },
    ]
    expect(defaultTypeId(types, "people", "locations")).toBe("places")
    expect(defaultTypeId(types, "places")).toBe("places")
    expect(defaultTypeId(types, "deleted")).toBe("people")
    expect(defaultTypeId(types, null)).toBe("people")
    expect(defaultTypeId([types[0]], undefined)).toBe("places")
    expect(defaultTypeId([], "places")).toBeNull()
  })

  test("opens the dialog filled with an AI idea", () => {
    openAddToWorldWith({ name: "Wren", notes: "A ferry pilot.", typeKey: "characters" }, null)
    expect(useAddToWorld.getState()).toMatchObject({
      open: true,
      name: "Wren",
      notes: "A ferry pilot.",
      typeKey: "characters",
      editor: null,
      range: null,
    })
  })
})
