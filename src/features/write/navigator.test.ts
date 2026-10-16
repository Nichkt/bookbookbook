import { describe, expect, test } from "vitest"
import type { ActListRow, ChapterListRow } from "@/db/queries"
import { navGroups } from "./navigator"

const act = (id: string, position: string, title: string | null = null): ActListRow => ({ id, position, title })

const chapter = (id: string, actId: string | null, position: string): ChapterListRow => ({
  id,
  position,
  act_id: actId,
  act_title: null,
  title: id,
  summary: null,
  status: null,
  word_target: null,
  words: 0,
})

const shape = (groups: ReturnType<typeof navGroups>) =>
  groups.map((group) => [group.key, group.label, group.chapters.map((entry) => `${entry.number}:${entry.chapter.id}`)])

describe("navGroups", () => {
  test("a book without acts is one list without a heading", () => {
    expect(shape(navGroups([], [chapter("b", null, "a1"), chapter("a", null, "a0")]))).toEqual([
      ["loose", null, ["1:a", "2:b"]],
    ])
  })

  test("numbers run on across acts; an empty act is left out but keeps its place in the act numbering", () => {
    const groups = navGroups(
      [act("first", "a0"), act("second", "a1", "  "), act("third", "a2", " The Light ")],
      [
        chapter("x", "third", "a0"),
        chapter("y", "second", "a1"),
        chapter("z", "second", "a0"),
        chapter("stray", null, "a0"),
      ],
    )
    expect(shape(groups)).toEqual([
      ["second", "Act 2", ["1:z", "2:y"]],
      ["third", "The Light", ["3:x"]],
      ["loose", "Not in an act", ["4:stray"]],
    ])
  })

  test("nothing to list in a book without chapters", () => {
    expect(navGroups([], [])).toEqual([])
    expect(navGroups([act("only", "a0", "Act I")], [])).toEqual([])
  })
})
