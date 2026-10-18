import { describe, expect, it } from "vitest"
import type { Codex, CodexEntry, CodexType } from "@/features/codex/codexData"
import {
  MAX_NAMES,
  MAX_VOICES,
  MENTIONED_ENTRIES,
  STORY_CHAPTERS,
  bookFacts,
  chapterFacts,
  chapterLabel,
  linkedEntries,
  namesToAvoid,
  storySoFar,
  textsToMatch,
  voicesFor,
  worldFor,
  worldItem,
} from "./facts"

const characterType: CodexType = {
  id: "type-characters",
  key: "characters",
  name: "Characters",
  singular: "Character",
  icon: "User",
  fields: ["Voice & speech"],
  builtin: true,
  tracked: true,
}

const locationType: CodexType = {
  ...characterType,
  id: "type-locations",
  key: "locations",
  name: "Locations",
  singular: "Location",
  fields: ["Description"],
}

const entry = (id: string, name: string, patch: Partial<CodexEntry> = {}): CodexEntry => ({
  id,
  typeId: characterType.id,
  name,
  named: true,
  aliases: [],
  tags: [],
  fields: { "Voice & speech": `${name} voice` },
  notes: `${name} notes`,
  aiContext: "mentioned",
  color: "",
  ...patch,
})

const codexOf = (entries: CodexEntry[]): Codex => {
  const types = [characterType, locationType]
  return {
    types,
    typeById: new Map(types.map((type) => [type.id, type])),
    entries,
    entryById: new Map(entries.map((item) => [item.id, item])),
    entriesByType: new Map(),
    tags: [],
  }
}

describe("facts for AI context", () => {
  it("summarizes book and chapter facts", () => {
    expect(
      bookFacts({
        id: "book",
        title: " Tide ",
        genre: " Mystery ",
        premise: " A ledger. ",
        synopsis: " It sinks. ",
        pov: "third_limited",
        tense: "past",
        audience: "young_adult",
        style_guide: " Spare. ",
        sample_passages: JSON.stringify([" One ", "Two"]),
      } as never),
    ).toMatchObject({
      title: "Tide",
      pov: "third person limited, close to one character at a time",
      samples: "One\n\nTwo",
    })
    expect(chapterLabel({ number: 3, title: " Ferry " })).toBe("Chapter 3: Ferry")
    const codex = codexOf([entry("mara", "Mara"), entry("harbor", "Harbor", { typeId: locationType.id })])
    expect(
      chapterFacts(
        {
          id: "ch",
          number: 2,
          title: "Arrival",
          summary: " Summary ",
          beats: [{ text: " Done ", done: true }, { text: " Next ", done: false }],
          present: ["mara"],
          pov_entry_id: "mara",
          location_entry_id: "harbor",
        } as never,
        codex,
      ),
    ).toMatchObject({
      label: "Chapter 2: Arrival",
      summary: "Summary",
      next: "Next",
      pov: "Mara",
      present: ["Mara"],
      location: "Harbor",
    })
  })

  it("limits story, world, voices and names", () => {
    const chapters = Array.from({ length: STORY_CHAPTERS + 5 }, (_, index) => ({
      id: `ch-${index}`,
      number: index + 1,
      title: `C${index}`,
      summary: `Summary ${index}`,
    }))
    expect(storySoFar(chapters as never, "ch-34")).toHaveLength(STORY_CHAPTERS)
    expect(storySoFar(chapters as never, "ch-34")[0].summary).toBe("Summary 4")

    const entries = Array.from({ length: Math.max(MENTIONED_ENTRIES, MAX_NAMES, MAX_VOICES) + 5 }, (_, index) =>
      entry(`e${index}`, `Name${index}`, { aiContext: index === 0 ? "always" : "mentioned" }),
    )
    const codex = codexOf(entries)
    expect(worldItem(codex, entries[0])).toMatchObject({ name: "Name0", type: "Character" })
    expect(textsToMatch({ before: "A", selection: "", after: "", chapter: "" }, { prompt: "B" }, {
      label: "C",
      summary: "C",
      moments: [{ text: "D", done: false }],
      next: null,
    })).toEqual(["A", "B", "C", "D"])
    expect(linkedEntries({ pov_entry_id: "a", location_entry_id: "b", present: ["c"], threads: ["d"] } as never))
      .toEqual(["a", "b", "c", "d"])
    expect(worldFor(codex, ["Name1 Name2 Name3"], entries.map((item) => item.id)).mentioned)
      .toHaveLength(MENTIONED_ENTRIES)
    expect(voicesFor(codex, entries.map((item) => item.name).join(" "), null))
      .toHaveLength(MAX_VOICES)
    expect(namesToAvoid(codex)).toHaveLength(MAX_NAMES)
  })
})
