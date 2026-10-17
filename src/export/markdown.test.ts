import { describe, expect, it } from "vitest"
import { br, heading, list, para, quote, sceneBreak, text } from "@/test/blocks"
import { MARKS, type Block, type Inline } from "./blocks"
import { blocksToMarkdown, markdownHeading, markdownToBlocks, parseInlines } from "./markdown"

describe("blocksToMarkdown", () => {
  it("writes marks as Markdown, and underline as HTML", () => {
    expect(
      blocksToMarkdown([
        para(
          text("Plain "),
          text("bold", "bold"),
          text(", "),
          text("italic", "italic"),
          text(", "),
          text("struck", "strike"),
          text(" and "),
          text("under", "underline"),
          text("."),
        ),
      ]),
    ).toBe("Plain **bold**, *italic*, ~~struck~~ and <u>under</u>.")
  })

  it("nests marks, keeping delimiters off whitespace", () => {
    expect(blocksToMarkdown([para(text("a "), text("b", "bold"), text("c", "bold", "italic"), text(" d", "bold"))])).toBe(
      "a **b*c* d**",
    )
    expect(blocksToMarkdown([para(text("so "), text("very ", "italic"), text("much"))])).toBe("so *very* much")
    expect(blocksToMarkdown([para(text("un"), text("believ", "italic"), text("able"))])).toBe("un*believ*able")
  })

  it("falls back to HTML where delimiters wouldn't read back", () => {
    expect(blocksToMarkdown([para(text("a"), text(".b", "bold"))])).toBe("a<strong>.b</strong>")
  })

  it("escapes what Markdown would read as markup", () => {
    const line = "*Not* a # heading, 2 < 3 & [sic] _x_ ~y~ `z` &amp; \\"
    expect(blocksToMarkdown([para(text(line))])).toBe(
      "\\*Not\\* a # heading, 2 \\< 3 & \\[sic] \\_x\\_ \\~y\\~ \\`z\\` \\&amp; \\\\",
    )
    expect(parseInlines(blocksToMarkdown([para(text(line))]))).toEqual([text(line)])
  })

  it("escapes block markers at the start of a line", () => {
    const lines = ["# not a heading", "- not a list", "1. not a list", "> not a quote", "+ plus", "=== not setext"]
    expect(blocksToMarkdown(lines.map((line) => para(text(line))))).toBe(
      ["\\# not a heading", "\\- not a list", "1\\. not a list", "\\> not a quote", "\\+ plus", "\\=== not setext"].join(
        "\n\n",
      ),
    )
  })

  it("writes line breaks, scene breaks, headings, quotes and lists", () => {
    expect(
      blocksToMarkdown(
        [
          heading(2, text("Title #")),
          para(text("one"), br, text("two")),
          sceneBreak,
          quote(para(text("a")), para(text("b"))),
          list(false, [[para(text("x"))], [para(text("y"))]]),
          list(false, [[para(text("z"))]]),
          list(true, [[para(text("nine"))], [para(text("ten"))]], 9),
        ],
        { headingOffset: 1 },
      ),
    ).toBe(
      [
        "### Title \\#",
        "one\\\ntwo",
        "* * *",
        "> a\n>\n> b",
        "- x\n- y",
        // Another list right after would join the first: it gets the other marker.
        "* z",
        "9. nine\n10. ten",
      ].join("\n\n"),
    )
  })

  it("drops empty blocks and line breaks at a paragraph's ends", () => {
    expect(blocksToMarkdown([para(), para(br, text("  x  "), br), heading(2, text(" "))])).toBe("x")
  })

  it("writes plain headings", () => {
    expect(markdownHeading(1, "Chapter 3: *Pick* #")).toBe("# Chapter 3: \\*Pick\\* \\#")
  })

  it("writes any mix of marks and punctuation so that it reads back exactly", () => {
    // Each character with its marks; whitespace's marks don't show, and a line's ends are trimmed.
    const signature = (inlines: readonly Inline[]) => {
      const chars = inlines.flatMap((inline) =>
        inline.type === "text" ? [...inline.text].map((char) => (/\s/.test(char) ? char : `${char}${inline.marks}|`)) : [],
      )
      while (chars.length > 0 && /^\s$/.test(chars[0])) chars.shift()
      while (chars.length > 0 && /^\s$/.test(chars.at(-1)!)) chars.pop()
      return chars.join("")
    }
    const alphabet = [..."ab  *_~.,\\<&#1[]()`!->=+:;'\"\u00a0", "&amp;", "<u>", "**"]
    let seed = 7
    const random = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return Math.floor((seed / 2 ** 31) * below)
    }
    for (let round = 0; round < 3000; round++) {
      const inlines = Array.from({ length: 1 + random(5) }, () =>
        text(
          Array.from({ length: 1 + random(4) }, () => alphabet[random(alphabet.length)]).join(""),
          ...MARKS.filter(() => random(3) === 0),
        ),
      )
      const markdown = blocksToMarkdown([para(...inlines)])
      const back = markdownToBlocks(markdown)
      const expected = signature(inlines)
      const actual = back.length === 1 && back[0].type === "paragraph" ? signature(back[0].inlines) : ""
      expect({ markdown, actual, blocks: back.length }).toEqual({ markdown, actual: expected, blocks: expected ? 1 : 0 })
    }
  })
})

describe("markdownToBlocks", () => {
  it("reads back what blocksToMarkdown writes", () => {
    const blocks: Block[] = [
      heading(2, text("Chapter "), text("One", "italic")),
      para(
        text("Plain, "),
        text("bold", "bold"),
        text(", "),
        text("bold italic", "bold", "italic"),
        text(", "),
        text("under", "underline"),
        text(" and "),
        text("struck", "strike"),
        text("."),
      ),
      para(text("Line one"), br, br, text("line \\ two")),
      sceneBreak,
      heading(3, text("Smaller")),
      quote(para(text("Quoted")), list(false, [[para(text("in a quote"))]])),
      list(false, [[para(text("a"))], [para(text("b")), list(true, [[para(text("c"))]], 3)]]),
      list(true, [[para(text("x"))], [para(text("y"))]], 9),
      para(text("* not a list, 1. not either, # nor a heading")),
      para(text("crossing "), text("a", "bold"), text("b", "bold", "italic"), text("c", "italic"), text(" marks")),
      para(text("x"), text("*", "bold"), text("y", "italic"), text("_", "strike")),
    ]
    expect(markdownToBlocks(blocksToMarkdown(blocks))).toEqual(blocks)
  })

  it("reads hand-written Markdown", () => {
    const markdown = [
      "---",
      "title: Ignored",
      "---",
      "# Chapter One",
      "",
      "It was a _dark_ and __stormy__ night;",
      "the rain fell in [torrents](https://example.com).  ",
      "Except at occasional intervals&mdash;",
      "",
      "***",
      "",
      "Setext",
      "======",
      "",
      "#### Deep",
      "",
      "> A quote",
      "continued lazily",
      "",
      "1) one",
      "2) two",
      "",
      "+ plus",
      "",
      "```",
      "  code *stays*",
      "```",
      "#",
      "⁂",
    ].join("\r\n")
    expect(markdownToBlocks(markdown)).toEqual([
      heading(2, text("Chapter One")),
      para(
        text("It was a "),
        text("dark", "italic"),
        text(" and "),
        text("stormy", "bold"),
        text(" night; the rain fell in torrents."),
        br,
        text("Except at occasional intervals—"),
      ),
      sceneBreak,
      heading(2, text("Setext")),
      heading(3, text("Deep")),
      quote(para(text("A quote continued lazily"))),
      list(true, [[para(text("one"))], [para(text("two"))]]),
      list(false, [[para(text("plus"))]]),
      para(text("  code *stays*")),
      sceneBreak,
      sceneBreak,
    ])
  })

  it("follows CommonMark's emphasis rules", () => {
    expect(parseInlines("*foo bar*")).toEqual([text("foo bar", "italic")])
    expect(parseInlines("a * foo bar*")).toEqual([text("a * foo bar*")])
    expect(parseInlines("foo*bar*")).toEqual([text("foo"), text("bar", "italic")])
    expect(parseInlines("_foo_bar_")).toEqual([text("foo_bar", "italic")])
    expect(parseInlines("snake_case_name")).toEqual([text("snake_case_name")])
    expect(parseInlines("***strong emph***")).toEqual([text("strong emph", "bold", "italic")])
    expect(parseInlines("*foo**bar**baz*")).toEqual([
      text("foo", "italic"),
      text("bar", "bold", "italic"),
      text("baz", "italic"),
    ])
    expect(parseInlines("*foo**bar*")).toEqual([text("foo**bar", "italic")])
    expect(parseInlines("**a*")).toEqual([text("*"), text("a", "italic")])
    expect(parseInlines("~one~ ~~two~~ ~~~three~~~")).toEqual([
      text("one", "strike"),
      text(" "),
      text("two", "strike"),
      text(" ~~~three~~~"),
    ])
  })

  it("reads inline HTML, entities, code, links and breaks", () => {
    expect(parseInlines('<b>b</b> <I>i</I> <u>u</u> <s>s</s> <span class="x">kept</span><br/>next')).toEqual([
      text("b", "bold"),
      text(" "),
      text("i", "italic"),
      text(" "),
      text("u", "underline"),
      text(" "),
      text("s", "strike"),
      text(" kept"),
      br,
      text("next"),
    ])
    expect(parseInlines("&amp; &#169; &#x41; &unknown; `` a ` b `` <!-- note -->x")).toEqual([
      text("& © A &unknown; a ` b x"),
    ])
    expect(parseInlines("[a *b*](url) and ![img](src) <https://example.com>")).toEqual([
      text("a "),
      text("b", "italic"),
      text(" and img https://example.com"),
    ])
    expect(parseInlines("hard\\\nbreak, soft\nbreak")).toEqual([text("hard"), br, text("break, soft break")])
  })
})
