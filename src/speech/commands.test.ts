import { describe, expect, test } from "vitest"
import { parseSpeech, plainText, spaced, type Step } from "./commands"

const on = { commands: true }
const words = (text: string) => ({ kind: "words", text }) as const satisfies Step

describe("parseSpeech", () => {
  test("turns punctuation words into marks, whatever case or punctuation the engine gives them", () => {
    expect(parseSpeech("she ran comma breathless Period", on)).toEqual([
      words("she ran"),
      { kind: "mark", mark: "," },
      words("breathless"),
      { kind: "mark", mark: "." },
    ])
    expect(parseSpeech("Why question mark. Go exclamation point! Wait full stop", on).map((step) => step.kind)).toEqual(
      ["words", "mark", "words", "mark", "words", "mark"],
    )
    expect(parseSpeech("open quote hi close quote colon semicolon unquote end quote exclamation mark", on)).toEqual([
      { kind: "mark", mark: "“" },
      words("hi"),
      { kind: "mark", mark: "”" },
      { kind: "mark", mark: ":" },
      { kind: "mark", mark: ";" },
      { kind: "mark", mark: "”" },
      { kind: "mark", mark: "”" },
      { kind: "mark", mark: "!" },
    ])
  })

  test("new line and new paragraph break; new moment and new beat only where there are moments", () => {
    expect(parseSpeech("one new line two new paragraph three", on)).toEqual([
      words("one"),
      { kind: "break", paragraph: false },
      words("two"),
      { kind: "break", paragraph: true },
      words("three"),
    ])
    expect(parseSpeech("a new moment b new beat c", { commands: true, moments: true })).toEqual([
      words("a"),
      { kind: "break", paragraph: false },
      words("b"),
      { kind: "break", paragraph: false },
      words("c"),
    ])
    expect(parseSpeech("a new moment b", on)).toEqual([words("a new moment b")])
  })

  test("scratch that takes back what came before it in the piece, or stays to take back the piece before", () => {
    expect(parseSpeech("she walked period scratch that she ran", on)).toEqual([words("she ran")])
    expect(parseSpeech("scratch that", on)).toEqual([{ kind: "scratch" }])
    expect(parseSpeech("scratch that she ran", on)).toEqual([{ kind: "scratch" }, words("she ran")])
    expect(parseSpeech("one scratch that scratch that two", on)).toEqual([{ kind: "scratch" }, words("two")])
    expect(parseSpeech("one scratch that two scratch that", on)).toEqual([])
  })

  test("stop listening ends the piece", () => {
    expect(parseSpeech("the end period stop listening and more", on)).toEqual([
      words("the end"),
      { kind: "mark", mark: "." },
      { kind: "stop" },
    ])
  })

  test("literal types the next command, or the next word, as words", () => {
    expect(parseSpeech("a literal period of grief", on)).toEqual([words("a period of grief")])
    expect(parseSpeech("press literal New Paragraph. twice", on)).toEqual([words("press new paragraph twice")])
    expect(parseSpeech("literal literal", on)).toEqual([words("literal")])
    expect(parseSpeech("say literal", on)).toEqual([words("say literal")])
  })

  test("with commands off, everything is words", () => {
    expect(parseSpeech("  a period new paragraph  scratch that ", { commands: false })).toEqual([
      words("a period new paragraph scratch that"),
    ])
    expect(parseSpeech("   ", { commands: false })).toEqual([])
    expect(parseSpeech("", on)).toEqual([])
  })
})

describe("spaced", () => {
  test("starts a sentence or line with a capital and no space", () => {
    expect(spaced("", words("she ran"))).toBe("She ran")
    expect(spaced("It rained.", words("she ran"))).toBe(" She ran")
    expect(spaced("It rained? ", words("she ran"))).toBe("She ran")
    expect(spaced("“Go.”", words("then"))).toBe(" Then")
    expect(spaced("First line\n", words("second"))).toBe("Second")
    expect(spaced("She said “", words("hello"))).toBe("Hello")
  })

  test("carries on a sentence in lower case after a space", () => {
    expect(spaced("It rained", words("and rained"))).toBe(" and rained")
    expect(spaced("It rained,", words("and rained"))).toBe(" and rained")
    expect(spaced("Mara (", words("again"))).toBe("again")
    expect(spaced("Mara —", words("again"))).toBe("again")
  })

  test("puts marks straight after the words, and an opening quote after a space", () => {
    expect(spaced("It rained", { kind: "mark", mark: "." })).toBe(".")
    expect(spaced("She said,", { kind: "mark", mark: "“" })).toBe(" “")
    expect(spaced("", { kind: "mark", mark: "“" })).toBe("“")
    expect(spaced("“Go.", { kind: "mark", mark: "”" })).toBe("”")
  })
})

test("plainText writes a piece as a note would have it", () => {
  const steps = parseSpeech("she opens the door new moment the room is empty period new paragraph done", {
    commands: true,
    moments: true,
  })
  expect(plainText("", steps)).toBe("She opens the door\nThe room is empty.\n\nDone")
  expect(plainText("Earlier.", parseSpeech("open quote run comma she said period close quote", on))).toBe(
    " “Run, she said.”",
  )
})
