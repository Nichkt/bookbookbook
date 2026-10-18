import { getSchema } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap"
import { describe, expect, test } from "vitest"
import * as Y from "yjs"
import { AI_MARK, PROSE_FIELD } from "@/yjs/prose"
import {
  compileFind,
  docMatches,
  expandReplacement,
  findInRuns,
  matchesIn,
  pmRuns,
  replaceAllInDoc,
  snippetOf,
  yRuns,
  type FindOptions,
} from "./find"

const schema = getSchema([
  StarterKit.configure({ undoRedo: false, code: false, codeBlock: false, link: false, trailingNode: false }),
])

const OPTIONS: FindOptions = { query: "", matchCase: false, wholeWord: false, pattern: false }

function regexFor(query: string, options: Partial<FindOptions> = {}): RegExp {
  const compiled = compileFind({ ...OPTIONS, ...options, query })
  if (!compiled?.regex) throw new Error(`no search for ${query}`)
  return compiled.regex
}

const found = (text: string, query: string, options: Partial<FindOptions> = {}) =>
  matchesIn(text, regexFor(query, options)).map((match) => match[0])

describe("compileFind", () => {
  test("has nothing to search for without a query", () => {
    expect(compileFind(OPTIONS)).toBeNull()
  })

  test("finds the words as typed, ignoring case unless asked", () => {
    expect(found("Mara met mara. MARA!", "mara")).toEqual(["Mara", "mara", "MARA"])
    expect(found("Mara met mara. MARA!", "mara", { matchCase: true })).toEqual(["mara"])
    expect(found("a.b axb (c) [d] {e} a+b ^$ x|y \\ a/b c-d", "a.b")).toEqual(["a.b"])
    for (const query of ["(c)", "[d]", "{e}", "a+b", "^$", "x|y", "\\", "a/b", "c-d"]) {
      expect(found("a.b axb (c) [d] {e} a+b ^$ x|y \\ a/b c-d", query)).toEqual([query])
    }
  })

  test("finds what typing turned into curly quotes, dashes and ellipses, either way round", () => {
    const text = "“Don’t,” she said—then… ‘wait’. \"Plain\" it's -- so..."
    expect(found(text, "don't")).toEqual(["Don’t"])
    expect(found(text, "it’s")).toEqual(["it's"])
    expect(found(text, '"Don')).toEqual(["“Don"])
    expect(found(text, "Plain”")).toEqual(['Plain"'])
    expect(found(text, "said--then...")).toEqual(["said—then…"])
    expect(found(text, "—")).toEqual(["—", "--"])
    expect(found(text, "…")).toEqual(["…", "..."])
    expect(found("a\u00a0b a b", "a b")).toEqual(["a\u00a0b", "a b"])
  })

  test("finds whole words only when asked, with accented letters and apostrophes", () => {
    const text = "The cat concatenated cats. Cat_2 cat's café cafés"
    expect(found(text, "cat")).toHaveLength(5)
    expect(found(text, "cat", { wholeWord: true })).toEqual(["cat", "cat"])
    expect(found(text, "café", { wholeWord: true })).toEqual(["café"])
    expect(found("cafe\u0301s cafe\u0301", "cafe", { wholeWord: true })).toEqual([])
    expect(found("Mara-Lin and Mara", "Mara", { wholeWord: true })).toEqual(["Mara", "Mara"])
  })

  test("runs a pattern, and says when it can't", () => {
    expect(found("color colour colr", "colou?r", { pattern: true })).toEqual(["color", "colour"])
    expect(found("Ana, Bo", "\\p{Lu}\\w+", { pattern: true, matchCase: true })).toEqual(["Ana", "Bo"])
    expect(found("one two", "\\w+", { pattern: true, wholeWord: true })).toEqual(["one", "two"])
    for (const query of ["(", "[a", "a{2,1}", "\\", "\\-"]) {
      expect(compileFind({ ...OPTIONS, query, pattern: true })).toEqual({ error: expect.any(String) })
    }
  })
})

describe("matchesIn", () => {
  test("leaves out empty matches without getting stuck, even next to emoji", () => {
    expect(matchesIn("axxb", /x*/gu).map((match) => [match.index, match[0]])).toEqual([[1, "xx"]])
    expect(matchesIn("😀a😀", /(?:)/gu)).toEqual([])
    expect(matchesIn("😀😀", /\b|$/g)).toEqual([])
  })

  test("stops at the limit and leaves the search ready for the next text", () => {
    const regex = /a/gu
    expect(matchesIn("aaaa", regex, 2)).toHaveLength(2)
    expect(regex.lastIndex).toBe(0)
    expect(matchesIn("a", regex)).toHaveLength(1)
    expect(() => matchesIn("a", /a/u)).toThrow()
  })
})

describe("expandReplacement", () => {
  const first = (text: string, source: string) => {
    const match = new RegExp(source, "gu").exec(text)
    if (!match) throw new Error("no match")
    return match
  }

  test("is the replacement as typed unless it's for a pattern", () => {
    expect(expandReplacement("$1 $& $$", first("ab", "(a)"), false)).toBe("$1 $& $$")
  })

  test("fills in groups as JavaScript does", () => {
    const text = "Mara Lin met Jonas Hale."
    const cases: [string, string][] = [
      ["(\\w+) (\\w+)", "$2, $1"],
      ["(\\w+) (\\w+)", "[$&] $$ $0 $3 $10 $01 $00 $"],
      ["(?<first>\\w+) (?<last>\\w+)", "$<last> $<first> $<none> $<first"],
      ["\\w+", "$<name> $1"],
      ["(a)?(\\w+)", "<$1|$2>"],
      ["(M)(a)(r)(a)( )(L)(i)(n)( )(m)(e)(t)", "$12-$13-$1$2"],
    ]
    for (const [source, replacement] of cases) {
      const match = first(text, source)
      const end = match.index + match[0].length
      const ours = text.slice(0, match.index) + expandReplacement(replacement, match, true) + text.slice(end)
      expect(ours).toBe(text.replace(new RegExp(source, "u"), replacement))
    }
  })
})

describe("snippetOf", () => {
  test("shows short text whole", () => {
    expect(snippetOf("Mara ran.", 0, 4)).toEqual({ before: "", match: "Mara", after: " ran." })
  })

  test("cuts long text at spaces either side, marking where", () => {
    const text = `${"word ".repeat(20)}Mara ${"more ".repeat(30)}`
    const start = text.indexOf("Mara")
    const { before, match, after } = snippetOf(text, start, start + 4)
    expect(match).toBe("Mara")
    expect(before.startsWith("…word ")).toBe(true)
    expect(before.length).toBeLessThan(40)
    expect(after.endsWith("more…")).toBe(true)
    expect(after).not.toMatch(/\s…$/)
    expect(after.length).toBeLessThan(80)
  })

  test("shortens a long match", () => {
    const text = "x".repeat(500)
    expect(snippetOf(text, 0, 500).match).toHaveLength(121)
  })
})

/** A scene with a bit of everything the editor makes. */
const SCENE = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "The ferry" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Mara " },
        { type: "text", text: "ran", marks: [{ type: "bold" }] },
        { type: "text", text: " to the ferry, " },
        { type: "text", text: "Mara", marks: [{ type: "italic" }] },
        { type: "text", text: " said." },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "One line" },
        { type: "hardBreak" },
        { type: "hardBreak" },
        { type: "text", text: "next line, Mara" },
      ],
    },
    { type: "horizontalRule" },
    { type: "paragraph" },
    {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Quoted Mara" }] },
        { type: "paragraph", content: [{ type: "text", text: "line two" }] },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item Mara" }] }] }],
    },
  ],
}

function scene() {
  const node = schema.nodeFromJSON(SCENE)
  const doc = new Y.Doc()
  prosemirrorToYXmlFragment(node, doc.getXmlFragment(PROSE_FIELD))
  return { node, doc }
}

const backToEditor = (doc: Y.Doc) => yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(PROSE_FIELD), schema)
const texts = (runs: { text: string }[]) => runs.map((run) => run.text).filter(Boolean)

describe("runs", () => {
  test("are the same in a scene doc and in its editor", () => {
    const { node, doc } = scene()
    expect(texts(yRuns(doc))).toEqual([
      "The ferry",
      "Mara ran to the ferry, Mara said.",
      "One line",
      "next line, Mara",
      "Quoted Mara",
      "line two",
      "Item Mara",
    ])
    expect(texts(pmRuns(node))).toEqual(texts(yRuns(doc)))
  })

  test("give each match the same words in both, by its place in the scene", () => {
    const { node, doc } = scene()
    for (const query of ["Mara", "line", "e", "ferry, Mara said"]) {
      const regex = regexFor(query)
      const runs = yRuns(doc)
      const inDoc = findInRuns(runs, regex).map(({ run, start, end }) => runs[run].text.slice(start, end))
      const inEditor = docMatches(node, regex).map(({ from, to }) => node.textBetween(from, to))
      expect(inEditor).toEqual(inDoc)
      expect(inDoc.length).toBeGreaterThan(0)
    }
    expect(docMatches(node, regexFor("line next"))).toEqual([])
    expect(docMatches(node, regexFor("e"), 3)).toHaveLength(3)
  })
})

const ORIGIN = Symbol("test-replace")

describe("replaceAllInDoc", () => {
  test("replaces every match in one undoable step, keeping each one's formatting", () => {
    const { doc } = scene()
    const fragment = doc.getXmlFragment(PROSE_FIELD)
    const undo = new Y.UndoManager(fragment, { trackedOrigins: new Set([ORIGIN]), captureTimeout: 0 })
    const before = backToEditor(doc).toJSON()

    expect(replaceAllInDoc(doc, regexFor("mara"), "Maya", false, ORIGIN)).toBe(5)
    const after = backToEditor(doc)
    expect(texts(pmRuns(after))).toEqual([
      "The ferry",
      "Maya ran to the ferry, Maya said.",
      "One line",
      "next line, Maya",
      "Quoted Maya",
      "line two",
      "Item Maya",
    ])
    const italic = after.child(1).child(3)
    expect([italic.text, italic.marks.map((mark) => mark.type.name)]).toEqual(["Maya", ["italic"]])
    expect(after.child(2).childCount).toBe(4)

    undo.undo()
    expect(backToEditor(doc).toJSON()).toEqual(before)
    expect(undo.canUndo()).toBe(false)
  })

  test("gives a match that spans formatting the formatting of its first letter", () => {
    const { doc } = scene()
    expect(replaceAllInDoc(doc, regexFor("ran to"), "sprinted to", false, ORIGIN)).toBe(1)
    const paragraph = backToEditor(doc).child(1)
    expect(paragraph.child(0).text).toBe("Mara ")
    expect(paragraph.child(1).text).toBe("sprinted to")
    expect(paragraph.child(1).marks.map((mark) => mark.type.name)).toEqual(["bold"])
    expect(paragraph.child(2).text).toBe(" the ferry, ")
  })

  test("fills in a pattern's groups, deletes with an empty replacement, and keeps line breaks", () => {
    const { doc } = scene()
    expect(replaceAllInDoc(doc, regexFor("(\\w+) line", { pattern: true }), "line $1", true, ORIGIN)).toBe(2)
    expect(replaceAllInDoc(doc, regexFor(", Mara"), "", false, ORIGIN)).toBe(2)
    const after = backToEditor(doc)
    expect(texts(pmRuns(after)).slice(1, 4)).toEqual(["Mara ran to the ferry said.", "line One", "line next"])
    expect(after.child(2).childCount).toBe(4)
    expect(replaceAllInDoc(doc, regexFor("nowhere"), "x", false, ORIGIN)).toBe(0)
  })

  test("leaves anything that isn't text where it was, as a run's end", () => {
    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement("paragraph")
    doc.getXmlFragment(PROSE_FIELD).insert(0, [paragraph])
    const text = new Y.XmlText()
    paragraph.insert(0, [text])
    text.insert(0, "ab")
    text.insertEmbed(2, { thing: 1 })
    text.insert(3, "bc")
    expect(texts(yRuns(doc))).toEqual(["ab", "bc"])
    expect(replaceAllInDoc(doc, regexFor("b"), "XY", false, ORIGIN)).toBe(2)
    expect(text.toDelta()).toEqual([{ insert: "aXY" }, { insert: { thing: 1 } }, { insert: "XYc" }])
  })

  test("replacement text does not inherit AI attributes", () => {
    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement("paragraph")
    doc.getXmlFragment(PROSE_FIELD).insert(0, [paragraph])
    const text = new Y.XmlText()
    paragraph.insert(0, [text])
    text.insert(0, "Mara", { [AI_MARK]: { card: "c" }, bold: true })
    expect(replaceAllInDoc(doc, regexFor("Mara"), "Maya", false, ORIGIN)).toBe(1)
    expect(text.toDelta()).toEqual([{ insert: "Maya", attributes: { bold: true } }])
  })
})
