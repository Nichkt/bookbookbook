import { describe, expect, it } from "vitest"
import { paras } from "@/test/blocks"
import {
  importGroups,
  mergeChapter,
  openingWords,
  outlineRows,
  outlineStats,
  removeAct,
  renameAct,
  renameChapter,
  setLeftOut,
  startAct,
  type DraftChapter,
  type Outline,
} from "./outline"

const chapter = (key: string, options: Partial<DraftChapter> = {}): DraftChapter => ({
  key,
  title: key.toUpperCase(),
  scenes: [{ title: "", blocks: paras(`Text of ${key}.`), words: 3 }],
  act: null,
  leftOut: false,
  ...options,
})

const keysOf = (outline: Outline) => outline.map((draft) => draft.key)
const groupsOf = (outline: Outline) => importGroups(outline).map((group) => [group.title, ...keysOf(group.chapters)])
const actsOf = (outline: Outline) => outline.map((draft) => draft.act)

describe("importGroups", () => {
  it("puts every chapter in one group without a title in a book without acts", () => {
    expect(groupsOf([chapter("a"), chapter("b")])).toEqual([[null, "a", "b"]])
  })

  it("puts chapters before the first act into it", () => {
    expect(groupsOf([chapter("a"), chapter("b", { act: "One" }), chapter("c"), chapter("d", { act: "" })])).toEqual([
      ["One", "a", "b", "c"],
      ["", "d"],
    ])
  })

  it("starts an act at the next chapter in when its own is left out", () => {
    expect(groupsOf([chapter("a", { act: "One", leftOut: true }), chapter("b"), chapter("c", { act: "Two" })])).toEqual([
      ["One", "b"],
      ["Two", "c"],
    ])
    expect(groupsOf([chapter("a", { act: "One", leftOut: true }), chapter("b", { act: "Two" })])).toEqual([["Two", "b"]])
    expect(groupsOf([chapter("a", { leftOut: true })])).toEqual([])
  })
})

describe("outlineStats", () => {
  it("counts what import will make", () => {
    const outline = [
      chapter("a", { leftOut: true }),
      chapter("b", { act: "One" }),
      chapter("c", { scenes: [...chapter("c").scenes, { title: "Later", blocks: paras("Two words."), words: 2 }] }),
    ]
    expect(outlineStats(outline)).toEqual({ chapters: 2, acts: 1, scenes: 3, words: 8 })
    expect(outlineStats([chapter("a")])).toEqual({ chapters: 1, acts: 0, scenes: 1, words: 3 })
  })
})

describe("outlineRows", () => {
  it("lists acts before their chapters, the first at the top, and numbers the chapters to import", () => {
    const rows = outlineRows([chapter("a", { leftOut: true }), chapter("b"), chapter("c", { act: "One" }), chapter("d", { act: "Two" })])
    expect(rows.map((row) => (row.kind === "act" ? `act ${row.number} ${row.title} @${row.startKey}` : `${row.chapter.key} ${row.number}`))).toEqual([
      "act 1 One @c",
      "a null",
      "b 1",
      "c 2",
      "act 2 Two @d",
      "d 3",
    ])
  })
})

describe("openingWords", () => {
  it("gives the first words, and says when there are more", () => {
    const long = chapter("a", { scenes: [{ title: "", blocks: paras("One two three", "four five six seven"), words: 7 }] })
    expect(openingWords(long, 5)).toBe("One two three four five…")
    expect(openingWords(long, 7)).toBe("One two three four five six seven")
    expect(openingWords(chapter("a", { scenes: [] }))).toBe("")
  })
})

describe("editing", () => {
  const outline = [chapter("a"), chapter("b", { act: "One" }), chapter("c")]

  it("renames chapters and acts, leaves chapters out, and removes acts", () => {
    expect(renameChapter(outline, "c", "The End")[2].title).toBe("The End")
    expect(setLeftOut(outline, "a", true)[0].leftOut).toBe(true)
    expect(actsOf(renameAct(outline, "b", "Part One"))).toEqual([null, "Part One", null])
    expect(actsOf(removeAct(outline, "b"))).toEqual([null, null, null])
    expect(outline[1]).toEqual(chapter("b", { act: "One" }))
  })

  it("starts an act at a chapter, with a first act before it in a book without them", () => {
    expect(actsOf(startAct(outline, "c"))).toEqual([null, "One", ""])
    expect(actsOf(startAct([chapter("a"), chapter("b"), chapter("c")], "c"))).toEqual(["", null, ""])
    expect(actsOf(startAct([chapter("a"), chapter("b")], "a"))).toEqual(["", null])
  })
})

describe("mergeChapter", () => {
  it("merges a chapter up, its title going to its first scene, and an act it started to the chapter after", () => {
    const merged = mergeChapter([chapter("a", { act: "One" }), chapter("b", { act: "Two" }), chapter("c")], "b", "up")
    expect(keysOf(merged)).toEqual(["a", "c"])
    expect(actsOf(merged)).toEqual(["One", "Two"])
    expect(merged[0].title).toBe("A")
    expect(merged[0].scenes.map((scene) => scene.title)).toEqual(["", "B"])
  })

  it("merges a chapter down, which keeps its act if it has one", () => {
    const merged = mergeChapter([chapter("a", { act: "One", leftOut: true }), chapter("b")], "a", "down")
    expect(merged).toEqual([
      chapter("b", { act: "One", scenes: [{ ...chapter("a").scenes[0], title: "A" }, ...chapter("b").scenes] }),
    ])
    expect(actsOf(mergeChapter([chapter("a", { act: "One" }), chapter("b", { act: "Two" })], "a", "down"))).toEqual(["Two"])
  })

  it("keeps a titled scene's title, and a chapter with nothing in it as a titled scene", () => {
    const titled = chapter("b", { scenes: [{ title: "Dawn", blocks: [], words: 0 }] })
    expect(mergeChapter([chapter("a"), titled], "b", "up")[0].scenes.map((scene) => scene.title)).toEqual(["", "Dawn"])
    const empty = chapter("b", { scenes: [] })
    expect(mergeChapter([chapter("a"), empty], "b", "up")[0].scenes.map((scene) => scene.title)).toEqual(["", "B"])
    expect(mergeChapter([chapter("a"), chapter("b", { title: "", scenes: [] })], "b", "up")[0].scenes).toHaveLength(1)
  })

  it("leaves the outline alone at either end", () => {
    const outline = [chapter("a"), chapter("b")]
    expect(mergeChapter(outline, "a", "up")).toBe(outline)
    expect(mergeChapter(outline, "b", "down")).toBe(outline)
    expect(mergeChapter(outline, "missing", "up")).toBe(outline)
  })
})
