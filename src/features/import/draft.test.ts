import { strToU8 } from "fflate"
import { describe, expect, it } from "vitest"
import type { DraftChapter } from "@/import/outline"
import { readPaste, readSource } from "@/import/read"
import { readPlainText } from "@/import/text"
import { paras } from "@/test/blocks"
import {
  chapterMeta,
  choiceLabel,
  draftOf,
  pushDraft,
  reparagraph,
  resplit,
  scenesMatter,
  sourceLabel,
  statsLabel,
  suggestedDetails,
  undoDraft,
  UNDO_LIMIT,
  type Draft,
  type History,
} from "./draft"

const NOVEL = [
  "The Long Tide",
  "by Ada Lane",
  "Chapter 1: Ferry",
  "The ferry nosed into the slip.",
  "* * *",
  "Night came early.",
  "Chapter 2: Island",
  "Gulls wheeled over the harbour.",
].join("\n\n")

const novel = () => draftOf(readSource("long-tide.txt", strToU8(NOVEL)))
const titles = (draft: Draft) => draft.outline.map((chapter) => `${chapter.title}${chapter.leftOut ? " (left out)" : ""}`)

describe("draftOf", () => {
  it("splits what was read the likeliest way", () => {
    const draft = novel()
    expect(draft.settings).toEqual({ mode: { kind: "lines" }, scenes: true })
    expect(draft.analysis.choices.map((choice) => [choice.mode.kind, choice.chapters])).toEqual([
      ["lines", 2],
      ["none", 1],
    ])
    expect(titles(draft)).toEqual([" (left out)", "Ferry", "Island"])
    expect(draft.outline[1].scenes).toHaveLength(2)
  })
})

describe("resplit", () => {
  it("splits again with other settings, keeping what was read", () => {
    const draft = novel()
    const whole = resplit(draft, { mode: { kind: "none" }, scenes: true })
    expect(whole.source).toBe(draft.source)
    expect(whole.settings.mode).toEqual({ kind: "none" })
    expect(whole.outline).toHaveLength(1)
    expect(whole.outline[0].leftOut).toBe(false)
    const unbroken = resplit(draft, { ...draft.settings, scenes: false })
    expect(unbroken.outline[1].scenes).toHaveLength(1)
  })
})

describe("reparagraph", () => {
  it("reads plain text again with its paragraphs parted another way, and splits it the likeliest way for that", () => {
    const draft = draftOf(readSource("tide.txt", strToU8("Chapter 1\nThe ferry.\nChapter 2\nThe island.")))
    expect(draft.source.paragraphing).toBe("lines")
    expect(draft.outline).toHaveLength(2)
    const joined = reparagraph(draft, "blank-lines")
    expect(joined.source.paragraphing).toBe("blank-lines")
    expect(joined.settings.mode).toEqual({ kind: "none" })
    expect(joined.outline).toHaveLength(1)
  })
})

describe("suggestedDetails", () => {
  it("takes the title page's title and byline", () => {
    expect(suggestedDetails(novel())).toEqual({ title: "The Long Tide", author: "Ada Lane" })
  })

  it("falls back on the file's own details, then its name", () => {
    const pieces = readPlainText("Chapter 1: Ferry\n\nThe ferry.\n\nChapter 2: Island\n\nGulls.", "blank-lines")
    const own = draftOf({ kind: "docx", name: "draft-v3", manuscript: { pieces, title: " Salt ", author: "Ada Lane" } })
    expect(suggestedDetails(own)).toEqual({ title: "Salt", author: "Ada Lane" })
    const bare = draftOf({ kind: "docx", name: "draft-v3", manuscript: { pieces, title: "", author: "" } })
    expect(suggestedDetails(bare)).toEqual({ title: "draft-v3", author: "" })
    expect(suggestedDetails(draftOf(readPaste("Chapter 1\n\nThe ferry.")))).toEqual({ title: "", author: "" })
  })
})

describe("scenesMatter", () => {
  it("says whether splitting into scenes changes anything", () => {
    expect(scenesMatter(novel())).toBe(true)
    expect(scenesMatter(draftOf(readPaste("Chapter 1\n\nThe ferry.\n\nChapter 2\n\nThe island.")))).toBe(false)
  })
})

describe("labels", () => {
  it("names each way of splitting, with the chapters it makes", () => {
    expect(choiceLabel({ mode: { kind: "headings", level: 0 }, chapters: 3 })).toBe("Title headings (3 chapters)")
    expect(choiceLabel({ mode: { kind: "headings", level: 2 }, chapters: 1 })).toBe("Heading 2 (1 chapter)")
    expect(choiceLabel({ mode: { kind: "lines" }, chapters: 1204 })).toBe("Lines like “Chapter 1” (1,204 chapters)")
    expect(choiceLabel({ mode: { kind: "none" }, chapters: 1 })).toBe("Nowhere: it’s all one chapter")
  })

  it("sums up what import will make, with acts only if there are any", () => {
    expect(statsLabel({ chapters: 24, acts: 3, scenes: 87, words: 91_234 })).toBe(
      "24 chapters · 3 acts · 87 scenes · 91,234 words",
    )
    expect(statsLabel({ chapters: 1, acts: 0, scenes: 1, words: 1 })).toBe("1 chapter · 1 scene · 1 word")
  })

  it("describes a chapter at a glance", () => {
    const chapter: DraftChapter = {
      key: "c",
      title: "Ferry",
      scenes: [
        { title: "", blocks: paras("The ferry nosed into the slip at dawn, gulls over the water and rain on the way."), words: 17 },
        { title: "", blocks: paras("Night."), words: 1 },
      ],
      act: null,
      leftOut: false,
    }
    expect(chapterMeta(chapter)).toBe("18 words · 2 scenes · The ferry nosed into the slip at dawn, gulls over the water…")
    expect(chapterMeta({ ...chapter, scenes: chapter.scenes.slice(1), leftOut: true })).toBe("Left out · 1 word · Night.")
    expect(chapterMeta({ ...chapter, scenes: [] })).toBe("Empty")
  })

  it("says where the manuscript came from", () => {
    expect(sourceLabel(novel().source)).toBe("From “long-tide”")
    expect(sourceLabel(readPaste("Text."))).toBe("From the text you pasted")
  })
})

describe("history", () => {
  const base = novel()
  const step = (name: string): Draft => ({ ...base, source: { ...base.source, name } })

  it("goes back a step at a time, a run of typing as one", () => {
    const [b, c, d] = [step("b"), step("c"), step("d")]
    let history: History = { draft: base, past: [] }
    history = pushDraft(history, b)
    history = pushDraft(history, c, true)
    expect(history).toEqual({ draft: c, past: [base] })
    history = pushDraft(history, d)
    expect(history.past).toEqual([base, c])
    history = undoDraft(history)
    expect(history.draft).toBe(c)
    history = undoDraft(history)
    expect(history).toEqual({ draft: base, past: [] })
    expect(undoDraft(history)).toBe(history)
  })

  it("keeps a step for typing that follows nothing to undo", () => {
    const b = step("b")
    expect(pushDraft({ draft: base, past: [] }, b, true)).toEqual({ draft: b, past: [base] })
  })

  it("ignores a change that changes nothing", () => {
    const history: History = { draft: base, past: [] }
    expect(pushDraft(history, base)).toBe(history)
  })

  it("remembers so many steps", () => {
    let history: History = { draft: base, past: [] }
    const first = step("first")
    history = pushDraft(history, first)
    for (let index = 0; index < UNDO_LIMIT + 5; index++) history = pushDraft(history, step(`${index}`))
    expect(history.past).toHaveLength(UNDO_LIMIT)
    expect(history.past).not.toContain(base)
    expect(history.past).not.toContain(first)
  })
})
