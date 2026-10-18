import { describe, expect, it } from "vitest"
import { SAMPLE_CHAPTERS } from "@/db/sampleBook"
import {
  BUILTIN_STRUCTURES,
  canonicalStructureKey,
  customKey,
  findStructure,
  MAX_STRUCTURE_FILE_BYTES,
  momentName,
  newBeatKey,
  normalizeStructure,
  overlayStructure,
  parseStructureFile,
  readStructureFile,
  scaffoldStructure,
  structureColumn,
  structureFile,
  structureFromRow,
  type PlacedChapter,
  type StoryStructure,
} from "./structures"

const chapter = (number: number, word_target: number | null, template_beat_key: string | null = null): PlacedChapter => ({
  id: `c${number}`,
  number,
  title: `Chapter ${number}`,
  word_target,
  template_beat_key,
})

const custom: StoryStructure = {
  key: customKey("t1"),
  name: "Braided",
  summary: "",
  acts: [],
  beats: [
    { key: "strand_a", name: "Strand A", pct: 0, description: "" },
    { key: "knot", name: "The knot", pct: 60, description: "" },
  ],
  templateId: "t1",
}

describe("built-in structures", () => {
  it("has seven, each with unique keys and moments in story order", () => {
    expect(BUILTIN_STRUCTURES).toHaveLength(7)
    expect(new Set(BUILTIN_STRUCTURES.map((structure) => structure.key)).size).toBe(7)
    expect(new Set(BUILTIN_STRUCTURES.map((structure) => structure.name)).size).toBe(7)
    for (const structure of BUILTIN_STRUCTURES) {
      const keys = structure.beats.map((item) => item.key)
      expect(new Set(keys).size, structure.key).toBe(keys.length)
      const pcts = structure.beats.map((item) => item.pct)
      expect(pcts, structure.key).toEqual([...pcts].sort((a, b) => a - b))
      expect(Math.min(...pcts)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...pcts)).toBeLessThanOrEqual(100)
      expect(structure.acts[0].pct, structure.key).toBe(0)
      for (const item of structure.beats) expect(item.description, item.key).not.toBe("")
    }
  })

  it("covers every structure moment the sample book uses", () => {
    const fifteen = findStructure("fifteen_beat")!
    const used = SAMPLE_CHAPTERS.map((sample) => sample.beat).filter(Boolean)
    expect(used.length).toBeGreaterThan(5)
    for (const key of used) expect(fifteen.beats.some((item) => item.key === key), key).toBe(true)
  })
})

describe("findStructure", () => {
  it("finds built-ins, the writer's own, and legacy keys", () => {
    expect(findStructure("three_act")?.name).toBe("Three-act structure")
    expect(findStructure("save_the_cat")?.key).toBe("fifteen_beat")
    expect(canonicalStructureKey("save_the_cat")).toBe("fifteen_beat")
    expect(findStructure(customKey("t1"), [custom])).toBe(custom)
    expect(findStructure(customKey("gone"), [custom])).toBeNull()
    expect(findStructure("nonsense")).toBeNull()
    expect(findStructure(null)).toBeNull()
  })
})

describe("momentName", () => {
  const fifteen = findStructure("fifteen_beat")
  it("reads from the book's structure first", () => {
    expect(momentName("catalyst", fifteen)).toEqual({ name: "Catalyst" })
  })
  it("says which structure a stray moment is from", () => {
    expect(momentName("ordeal", fifteen)).toEqual({ name: "The ordeal", from: "Hero's journey (12 stages)" })
    expect(momentName("knot", null, [custom])).toEqual({ name: "The knot", from: "Braided" })
  })
  it("falls back to the key made readable", () => {
    expect(momentName("lost_letter", fifteen)).toEqual({ name: "Lost letter" })
  })
})

describe("overlayStructure", () => {
  const structure: StoryStructure = {
    key: "test",
    name: "Test",
    summary: "",
    acts: [],
    beats: [
      { key: "start", name: "Start", pct: 0, description: "" },
      { key: "turn", name: "Turn", pct: 30, description: "" },
      { key: "middle", name: "Middle", pct: 50, description: "" },
      { key: "end", name: "End", pct: 100, description: "" },
    ],
  }

  it("places moments by share of the word count targets", () => {
    const chapters = [chapter(1, 1000, "start"), chapter(2, 3000), chapter(3, 1000, "middle"), chapter(4, 5000)]
    const overlay = overlayStructure(structure, chapters)
    expect(overlay.basis).toBe("targets")
    expect(overlay.segments.map((segment) => [segment.start, segment.end])).toEqual([
      [0, 0.1],
      [0.1, 0.4],
      [0.4, 0.5],
      [0.5, 1],
    ])
    const [start, turn, middle, end] = overlay.placements
    expect(start.mapped.map((item) => item.id)).toEqual(["c1"])
    expect(start.spanning?.id).toBe("c1")
    expect(turn.mapped).toEqual([])
    expect(turn.spanning?.id).toBe("c2")
    // A moment on a boundary belongs to the chapter that starts there.
    expect(middle.spanning?.id).toBe("c4")
    expect(middle.mapped.map((item) => item.id)).toEqual(["c3"])
    expect(end.at).toBe(1)
    expect(end.spanning?.id).toBe("c4")
  })

  it("counts a chapter without a target as an average one", () => {
    const overlay = overlayStructure(structure, [chapter(1, 2000), chapter(2, null), chapter(3, 4000), chapter(4, 0)])
    expect(overlay.basis).toBe("targets")
    expect(overlay.segments.map((segment) => segment.end)).toEqual([2000 / 12000, 5000 / 12000, 9000 / 12000, 1])
  })

  it("counts chapters when none has a target", () => {
    const overlay = overlayStructure(structure, [chapter(1, null), chapter(2, 0), chapter(3, null), chapter(4, null)])
    expect(overlay.basis).toBe("chapters")
    expect(overlay.placements[1].spanning?.id).toBe("c2")
  })

  it("copes with a book without chapters", () => {
    const overlay = overlayStructure(structure, [])
    expect(overlay.segments).toEqual([])
    expect(overlay.placements.every((placement) => placement.spanning === null)).toBe(true)
  })
})

describe("scaffoldStructure", () => {
  it("makes a chapter per moment, in the act it falls in", () => {
    const { acts, hasActs } = scaffoldStructure(findStructure("three_act")!, 90_000, 3000)
    expect(hasActs).toBe(true)
    expect(acts.map((act) => act.title)).toEqual(["Act I — Setup", "Act II — Confrontation", "Act III — Resolution"])
    expect(acts.map((act) => act.chapters.map((item) => item.beatKey))).toEqual([
      ["setup", "inciting_incident"],
      ["first_turning_point", "rising_action", "midpoint"],
      ["second_turning_point", "climax", "resolution"],
    ])
    expect(acts[0].chapters[1]).toEqual({
      title: "Inciting incident",
      beatKey: "inciting_incident",
      wordTarget: 11_300,
    })
  })

  it("uses the fallback target without a book target, and no acts when the structure has none", () => {
    const { acts, hasActs } = scaffoldStructure(custom, null, 3000)
    expect(hasActs).toBe(false)
    expect(acts).toHaveLength(1)
    expect(acts[0].title).toBe("")
    expect(acts[0].chapters.map((item) => item.wordTarget)).toEqual([3000, 3000])
  })
})

describe("custom structures", () => {
  it("cleans up what it's given", () => {
    const draft = normalizeStructure({
      name: "  Mine  ",
      acts: [{ title: " Part one ", pct: -5 }, { title: "", pct: 50 }, "nope"],
      beats: [
        { name: " Hook ", pct: "12.34", description: " Grab them " },
        { name: "", pct: 20 },
        { key: "hook", name: "Hook", pct: 150 },
        { key: "bad key!", name: "Twist", pct: Number.NaN },
        42,
      ],
    })
    expect(draft).toEqual({
      name: "Mine",
      acts: [{ title: "Part one", pct: 0 }],
      beats: [
        { key: "hook", name: "Hook", pct: 12.3, description: "Grab them" },
        { key: "hook_2", name: "Hook", pct: 100, description: "" },
        { key: "twist", name: "Twist", pct: 0, description: "" },
      ],
    })
    expect(normalizeStructure({ name: "Empty", beats: [] })).toBeNull()
    expect(normalizeStructure("text")).toBeNull()
  })

  it("makes readable, unique keys", () => {
    expect(newBeatKey("Shō: development", new Set())).toBe("sho_development")
    expect(newBeatKey("!!!", new Set())).toBe("moment")
    expect(newBeatKey("Hook", new Set(["hook", "hook_2"]))).toBe("hook_3")
  })

  it("round-trips through a file", () => {
    const structure = findStructure("seven_point")!
    const file = structureFile(structure)
    expect(JSON.parse(file)).toMatchObject({ format: "bookbookbook-structure", version: 1, name: "Seven-point structure" })
    expect(parseStructureFile(file)).toEqual({ name: structure.name, acts: structure.acts, beats: structure.beats })
  })

  it("says why a file can't be read", () => {
    expect(() => parseStructureFile("not json")).toThrow("isn't JSON")
    expect(() => parseStructureFile(JSON.stringify({ format: "other", beats: [] }))).toThrow("isn't a bookbookbook")
    expect(() => parseStructureFile(JSON.stringify({ beats: [] }))).toThrow("no structure moments")
  })

  it("reads a picked file, but not one far too big to be a structure", async () => {
    const shared = structureFile(findStructure("seven_point")!)
    expect((await readStructureFile(new Blob([shared]))).name).toBe("Seven-point structure")
    const huge = new Blob([shared, " ".repeat(MAX_STRUCTURE_FILE_BYTES)])
    await expect(readStructureFile(huge)).rejects.toThrow("too big to be a structure")
  })

  it("reads a templates row", () => {
    const column = structureColumn({ acts: custom.acts, beats: custom.beats })
    const structure = structureFromRow({ id: "t1", name: "Braided", beats: column })
    expect(structure).toEqual({ ...custom, summary: "Your own structure, 2 moments." })
    expect(structureFromRow({ id: "t2", name: "Bare", beats: JSON.stringify(custom.beats) })?.beats).toEqual(
      custom.beats,
    )
    expect(structureFromRow({ id: "t3", name: "Broken", beats: "{" })).toBeNull()
  })
})
