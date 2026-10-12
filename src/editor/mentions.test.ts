import { describe, expect, it } from "vitest"
import { buildMentionMatcher, EMPTY_MATCHER, parseAliases, type MentionTarget } from "./mentions"

const ENTRIES: MentionTarget[] = [
  { id: "mara", name: "Mara Quill", aliases: ["Mara"] },
  { id: "jonas", name: "Jonas Quill", aliases: ["Jonas"] },
  { id: "light", name: "Grayhaven Light", aliases: ["the lighthouse"] },
  { id: "island", name: "Grayhaven", aliases: [] },
  // "Quill" belongs to two people, so it must never link.
  { id: "thomas", name: "Thomas Quill", aliases: ["Thomas", "Quill"] },
  { id: "elias", name: "Elias Penhallow", aliases: ["Quill", "E", "Dr. Penhallow"] },
]

const matcher = buildMentionMatcher(ENTRIES)
const found = (text: string) => matcher.find(text).map((match) => [text.slice(match.from, match.to), match.entryId])

describe("buildMentionMatcher", () => {
  it("finds names and aliases with their entries", () => {
    expect(found("Mara met Jonas by the lighthouse.")).toEqual([
      ["Mara", "mara"],
      ["Jonas", "jonas"],
      ["the lighthouse", "light"],
    ])
  })

  it("prefers the longest term", () => {
    expect(found("Jonas Quill climbed to Grayhaven Light, high above Grayhaven.")).toEqual([
      ["Jonas Quill", "jonas"],
      ["Grayhaven Light", "light"],
      ["Grayhaven", "island"],
    ])
  })

  it("matches whole words only", () => {
    expect(found("Maraschino, Jonasson and Grayhavens")).toEqual([])
    expect(found("_Mara and Mara1")).toEqual([])
  })

  it("treats apostrophes and punctuation as boundaries", () => {
    expect(found("Mara's coat. (Jonas) “Mara” Mara’s")).toEqual([
      ["Mara", "mara"],
      ["Jonas", "jonas"],
      ["Mara", "mara"],
      ["Mara", "mara"],
    ])
  })

  it("is case-sensitive", () => {
    expect(found("mara and MARA")).toEqual([])
  })

  it("never links a term two entries share", () => {
    expect(found("Quill said nothing.")).toEqual([])
    expect(found("Thomas Quill")).toEqual([["Thomas Quill", "thomas"]])
  })

  it("skips one-letter terms and escapes regex characters", () => {
    expect(found("E said so")).toEqual([])
    expect(found("Dr. Penhallow and Dr- Penhallow")).toEqual([["Dr. Penhallow", "elias"]])
  })

  it("handles letters outside ASCII", () => {
    const accented = buildMentionMatcher([{ id: "zoe", name: "Zoë", aliases: ["Ægir"] }])
    expect(accented.find("Zoë met Ægir; Zoëy did not.").map((match) => match.entryId)).toEqual(["zoe", "zoe"])
    expect(accented.find("Zoe")).toEqual([])
    // A combining mark continues the word: "Zoe" + U+0308 is not "Zoe".
    expect(buildMentionMatcher([{ id: "zoe", name: "Zoe", aliases: [] }]).find("Zoe\u0308 left")).toEqual([])
  })

  it("is reusable: global regex state never leaks between calls", () => {
    expect(found("Mara")).toEqual([["Mara", "mara"]])
    expect(found("Mara")).toEqual([["Mara", "mara"]])
  })

  it("returns the empty matcher when nothing can match", () => {
    expect(buildMentionMatcher([])).toBe(EMPTY_MATCHER)
    expect(buildMentionMatcher([{ id: "x", name: "X", aliases: [" "] }])).toBe(EMPTY_MATCHER)
  })
})

describe("parseAliases", () => {
  it("reads a JSON array of strings and ignores anything else", () => {
    expect(parseAliases('["Mara", "Mars", 3, null]')).toEqual(["Mara", "Mars"])
    expect(parseAliases(null)).toEqual([])
    expect(parseAliases("")).toEqual([])
    expect(parseAliases("not json")).toEqual([])
    expect(parseAliases('{"a": 1}')).toEqual([])
  })
})
