import { describe, expect, test } from "vitest"
import { formatStoryTime, parseStoryTime, serializeStoryTime, storyTimeFromText } from "./storyTime"

describe("parseStoryTime", () => {
  test("reads the JSON structure", () => {
    expect(parseStoryTime('{"mode":"relative","day":3,"part":"evening"}')).toEqual({
      mode: "relative",
      day: 3,
      part: "evening",
    })
    expect(parseStoryTime('{"mode":"date","date":"1891-10-04T21:00","label":"The fire"}')).toEqual({
      mode: "date",
      date: "1891-10-04T21:00",
      label: "The fire",
    })
  })

  test("reads M0's plain strings", () => {
    expect(parseStoryTime("Day 1 morning")).toEqual({ mode: "relative", day: 1, part: "morning" })
    expect(parseStoryTime("Day 5")).toEqual({ mode: "relative", day: 5 })
    expect(parseStoryTime("day 8, noon")).toEqual({ mode: "relative", day: 8, part: "midday" })
    expect(parseStoryTime("12 years earlier")).toEqual({ mode: "relative", label: "12 years earlier", era: "flashback" })
    expect(parseStoryTime("Midsummer")).toEqual({ mode: "relative", label: "Midsummer" })
  })

  test("treats empty or broken values as no time", () => {
    expect(parseStoryTime(null)).toBeNull()
    expect(parseStoryTime("   ")).toBeNull()
    expect(parseStoryTime("{}")).toBeNull()
    expect(parseStoryTime('{"day":"three","part":"teatime"}')).toBeNull()
    expect(parseStoryTime("{not json")).toEqual({ mode: "relative", label: "{not json" })
  })

  test("keeps only the fields of the chosen mode", () => {
    expect(parseStoryTime('{"mode":"date","day":2,"date":"2024-01-02"}')).toEqual({ mode: "date", date: "2024-01-02" })
    expect(parseStoryTime('{"mode":"relative","day":2,"date":"2024-01-02"}')).toEqual({ mode: "relative", day: 2 })
  })
})

describe("serializeStoryTime", () => {
  test("round-trips and stores nothing for an empty time", () => {
    const stored = serializeStoryTime({ mode: "relative", day: 4, part: "night", label: " " })
    expect(stored).toBe('{"mode":"relative","day":4,"part":"night"}')
    expect(parseStoryTime(stored)).toEqual({ mode: "relative", day: 4, part: "night" })
    expect(serializeStoryTime({ mode: "relative" })).toBeNull()
    expect(serializeStoryTime(null)).toBeNull()
  })
})

describe("formatStoryTime", () => {
  test("formats each shape", () => {
    expect(formatStoryTime(storyTimeFromText("Day 1 morning"))).toBe("Day 1, morning")
    expect(formatStoryTime(storyTimeFromText("Day 7"))).toBe("Day 7")
    expect(formatStoryTime(storyTimeFromText("12 years earlier"))).toBe("12 years earlier")
    expect(formatStoryTime({ mode: "relative", part: "dawn" })).toBe("Dawn")
    expect(formatStoryTime({ mode: "relative", day: 3, part: "evening", label: "Midsummer" })).toBe(
      "Midsummer · Day 3, evening",
    )
    expect(formatStoryTime({ mode: "date", date: "1891-10-04T21:00" }, "en-US")).toBe("Oct 4, 1891, 21:00")
    expect(formatStoryTime({ mode: "date", date: "0044-03-15" }, "en-US")).toBe("Mar 15, 44")
    expect(formatStoryTime(null)).toBe("")
  })
})
