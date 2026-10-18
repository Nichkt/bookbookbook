import { templateBeatName } from "./display"

/*
 * Story structures (DESIGN.md §6 "Templates"): the turning points most stories pass through, as guides describe them.
 * The app calls a structure's beats "structure moments". Built-ins live here; the writer's own are rows of the
 * `templates` table. Names are descriptive, since some methods' names are trademarks.
 */

export interface StructureBeat {
  /** Stable: chapters store it in `template_beat_key`. */
  key: string
  name: string
  /** Where it lands, as a percentage of the book. */
  pct: number
  description: string
}

export interface StructureAct {
  title: string
  /** Where the act starts, as a percentage of the book. */
  pct: number
}

export interface StoryStructure {
  /** What `books.template_key` stores: a built-in's key, or `custom:` and the templates row id. */
  key: string
  name: string
  /** One line, for menus. */
  summary: string
  acts: StructureAct[]
  /** In story order. */
  beats: StructureBeat[]
  /** The `templates` row of a custom structure. */
  templateId?: string
}

const beat = (key: string, name: string, pct: number, description: string): StructureBeat => ({
  key,
  name,
  pct,
  description,
})

export const BUILTIN_STRUCTURES: readonly StoryStructure[] = [
  {
    key: "three_act",
    name: "Three-act structure",
    summary: "Setup, confrontation and resolution: the classic shape.",
    acts: [
      { title: "Act I — Setup", pct: 0 },
      { title: "Act II — Confrontation", pct: 25 },
      { title: "Act III — Resolution", pct: 75 },
    ],
    beats: [
      beat("setup", "Setup", 0, "The main character in their everyday life: what they want, and what's missing."),
      beat("inciting_incident", "Inciting incident", 12, "Something upsets the everyday and sets the story going."),
      beat(
        "first_turning_point",
        "First turning point",
        25,
        "The main character commits to the problem, and there's no going back. Act two begins.",
      ),
      beat(
        "rising_action",
        "Rising action",
        37,
        "Attempts and obstacles: they try, learn, and meet stronger opposition.",
      ),
      beat("midpoint", "Midpoint", 50, "A reveal or reversal changes what the story is about, and raises the stakes."),
      beat(
        "second_turning_point",
        "Second turning point",
        75,
        "A low point or a discovery forces the final confrontation. Act three begins.",
      ),
      beat("climax", "Climax", 88, "The final confrontation, where the story's main question is answered."),
      beat("resolution", "Resolution", 97, "The new normal: what has changed, and what it cost."),
    ],
  },
  {
    key: "fifteen_beat",
    name: "15-beat structure",
    summary: "A detailed beat sheet from screenwriting, in the style of Save the Cat!",
    acts: [
      { title: "Act I", pct: 0 },
      { title: "Act II", pct: 20 },
      { title: "Act III", pct: 80 },
    ],
    beats: [
      beat(
        "opening_image",
        "Opening image",
        0,
        "A snapshot of the main character's life before the story changes it. The final image will mirror it.",
      ),
      beat(
        "theme_stated",
        "Theme stated",
        4,
        "Someone hints at what the story is really about: a lesson the main character hasn't learned yet.",
      ),
      beat("setup", "Setup", 6, "The main character's everyday world, the people in it, and what's wrong or missing."),
      beat("catalyst", "Catalyst", 10, "The event that upsets everything and sets the story going."),
      beat("debate", "Debate", 15, "The main character hesitates. Should they act? What will it cost?"),
      beat("break_into_two", "Break into two", 20, "They decide, and step into a new situation. Act two begins."),
      beat(
        "b_story",
        "B story",
        22,
        "A second storyline starts, often a relationship, that will help the main character learn the theme.",
      ),
      beat(
        "fun_and_games",
        "Fun and games",
        35,
        "The promise of the premise: the main character explores the new situation, and wins some and loses some.",
      ),
      beat(
        "midpoint",
        "Midpoint",
        50,
        "A false victory or a false defeat. The stakes rise, and there's no going back.",
      ),
      beat(
        "bad_guys_close_in",
        "Bad guys close in",
        62,
        "Pressure from outside, doubts from within. Things start to fall apart.",
      ),
      beat(
        "all_is_lost",
        "All is lost",
        75,
        "The lowest point. Something or someone is lost, and the goal seems out of reach.",
      ),
      beat(
        "dark_night_of_the_soul",
        "Dark night of the soul",
        78,
        "The main character reckons with the loss, and finally sees what they must change.",
      ),
      beat(
        "break_into_three",
        "Break into three",
        80,
        "A new idea, often from the B story, shows the way forward. Act three begins.",
      ),
      beat(
        "finale",
        "Finale",
        90,
        "The main character puts what they've learned into action and faces the final challenge.",
      ),
      beat(
        "final_image",
        "Final image",
        99,
        "Life after: the opposite of the opening image, showing how much has changed.",
      ),
    ],
  },
  {
    key: "heros_journey",
    name: "Hero's journey (12 stages)",
    summary: "The mythic quest: leave home, face trials, come back changed.",
    acts: [
      { title: "Departure", pct: 0 },
      { title: "Initiation", pct: 25 },
      { title: "Return", pct: 75 },
    ],
    beats: [
      beat("ordinary_world", "The ordinary world", 0, "The hero at home, before the adventure, and what they lack."),
      beat("call_to_adventure", "The call to adventure", 8, "A problem, a challenge or an invitation arrives."),
      beat("refusal_of_the_call", "Refusal of the call", 14, "Fear or duty holds the hero back, at first."),
      beat(
        "meeting_the_mentor",
        "Meeting the mentor",
        20,
        "Someone gives the hero advice, training, a gift or courage.",
      ),
      beat("crossing_the_threshold", "Crossing the threshold", 25, "The hero commits, and leaves the familiar world."),
      beat(
        "tests_allies_enemies",
        "Tests, allies and enemies",
        35,
        "The hero learns the new world's rules, and who to trust.",
      ),
      beat("approach", "Approaching the inmost cave", 45, "Getting ready for the biggest danger yet. Tension builds."),
      beat("ordeal", "The ordeal", 50, "A life-or-death crisis, where the hero faces their greatest fear."),
      beat(
        "reward",
        "The reward",
        60,
        "Having survived, the hero takes the prize: an object, knowledge, or a reconciliation.",
      ),
      beat("road_back", "The road back", 75, "The hero heads home, but the danger follows."),
      beat("resurrection", "The resurrection", 90, "One last, hardest test, where everything learned is put to use."),
      beat(
        "return_with_elixir",
        "Return with the elixir",
        98,
        "The hero comes home changed, with something that helps others.",
      ),
    ],
  },
  {
    key: "story_circle",
    name: "Story circle (8 steps)",
    summary: "A character leaves their comfort zone, gets what they want, pays for it, and comes back changed.",
    acts: [
      { title: "Comfort zone", pct: 0 },
      { title: "The search", pct: 25 },
      { title: "Coming back", pct: 75 },
    ],
    beats: [
      beat("you", "You", 0, "A character in their comfort zone."),
      beat("need", "Need", 12, "They want something."),
      beat("go", "Go", 25, "They enter an unfamiliar situation."),
      beat("search", "Search", 37, "They adapt to it, and struggle."),
      beat("find", "Find", 50, "They get what they wanted."),
      beat("take", "Take", 62, "They pay a heavy price for it."),
      beat("return", "Return", 75, "They go back to where they started."),
      beat("change", "Change", 90, "Having changed."),
    ],
  },
  {
    key: "seven_point",
    name: "Seven-point structure",
    summary: "Decide the ending first, then the turns that get there.",
    acts: [
      { title: "Beginning", pct: 0 },
      { title: "Middle", pct: 25 },
      { title: "End", pct: 75 },
    ],
    beats: [
      beat("hook", "Hook", 0, "Where the main character starts: usually the opposite of where they end up."),
      beat(
        "plot_turn_1",
        "Plot turn 1",
        20,
        "Something new arrives, an idea, a person or a conflict, and sets the story moving.",
      ),
      beat("pinch_1", "Pinch point 1", 37, "The opposition shows its strength, and forces the main character to act."),
      beat("midpoint", "Midpoint", 50, "The main character stops reacting and starts acting."),
      beat("pinch_2", "Pinch point 2", 62, "More pressure: a plan fails or an ally is lost, and things look bleak."),
      beat(
        "plot_turn_2",
        "Plot turn 2",
        80,
        "The last piece falls into place: the main character finds what they need to win.",
      ),
      beat("resolution", "Resolution", 98, "The climax and its outcome: everything the story has built toward."),
    ],
  },
  {
    key: "romance_beats",
    name: "Romance beats",
    summary: "Two people fall in love, pull apart, and fight their way back, in four phases.",
    acts: [
      { title: "Setup", pct: 0 },
      { title: "Falling in love", pct: 25 },
      { title: "Retreating", pct: 50 },
      { title: "Fighting for love", pct: 75 },
    ],
    beats: [
      beat(
        "meet_first_lead",
        "Meet the first lead",
        0,
        "One love interest in their world, and what's missing from their life.",
      ),
      beat(
        "meet_second_lead",
        "Meet the second lead",
        5,
        "The other love interest, and the wound or belief holding them back.",
      ),
      beat("the_meeting", "The meeting", 10, "They meet, and something sparks, even if it's irritation."),
      beat("resistance", "Resistance", 18, "The reasons they can't, or won't, be together."),
      beat("thrown_together", "Thrown together", 25, "Circumstances keep pushing them into each other's company."),
      beat(
        "growing_attraction",
        "Growing attraction",
        35,
        "They start to see each other clearly, and like what they see.",
      ),
      beat("maybe_this_could_work", "Maybe this could work", 45, "A glimpse of what they could be together."),
      beat("first_commitment", "First commitment", 50, "A kiss, a confession, a night together: a real step in."),
      beat("doubts", "Doubts creep in", 58, "Old fears return. Getting closer means risking more."),
      beat("pulling_away", "Pulling away", 68, "One or both of them retreat to protect themselves."),
      beat("the_breakup", "The breakup", 75, "The worst happens: they split, or a secret tears them apart."),
      beat("dark_moment", "Dark moment", 82, "Apart, each faces what they've lost, and what they must change."),
      beat("grand_gesture", "Grand gesture", 92, "One of them proves they've changed, and risks everything for love."),
      beat("together", "Together", 99, "Happily ever after, or happy for now: the reward for how they've grown."),
    ],
  },
  {
    key: "kishotenketsu",
    name: "Kishōtenketsu (four parts)",
    summary: "A four-part shape from East Asian storytelling, built on a twist rather than a conflict.",
    acts: [
      { title: "Ki — Introduction", pct: 0 },
      { title: "Shō — Development", pct: 25 },
      { title: "Ten — Twist", pct: 50 },
      { title: "Ketsu — Reconciliation", pct: 75 },
    ],
    beats: [
      beat("ki", "Introduction", 0, "Introduce the characters and their world."),
      beat("sho", "Development", 25, "Develop what was introduced. Nothing big changes yet."),
      beat("ten", "Twist", 50, "Something unexpected shifts the meaning of everything so far."),
      beat(
        "ketsu",
        "Reconciliation",
        75,
        "Bring the parts together, and show the new understanding the twist created.",
      ),
    ],
  },
]

/** Keys books were saved with before a structure got its descriptive key. */
const LEGACY_KEYS: Readonly<Record<string, string>> = { save_the_cat: "fifteen_beat" }

export const CUSTOM_PREFIX = "custom:"
export const customKey = (templateId: string) => `${CUSTOM_PREFIX}${templateId}`

/** The structure a `books.template_key` names, among the built-ins and the writer's own. */
export function findStructure(key: string | null | undefined, custom: readonly StoryStructure[] = []) {
  if (!key) return null
  const wanted = LEGACY_KEYS[key] ?? key
  return (
    BUILTIN_STRUCTURES.find((structure) => structure.key === wanted) ??
    custom.find((structure) => structure.key === wanted) ??
    null
  )
}

/** The key to store for a structure: the current one for a legacy key. */
export const canonicalStructureKey = (key: string) => LEGACY_KEYS[key] ?? key

export interface MomentName {
  name: string
  /** Set when the moment comes from a structure other than the book's. */
  from?: string
}

/** How a chapter's `template_beat_key` reads: from the book's structure first, then any other. */
export function momentName(
  key: string,
  structure: StoryStructure | null,
  custom: readonly StoryStructure[] = [],
): MomentName {
  const own = structure?.beats.find((candidate) => candidate.key === key)
  if (own) return { name: own.name }
  for (const other of [...BUILTIN_STRUCTURES, ...custom]) {
    const found = other.beats.find((candidate) => candidate.key === key)
    if (found) return { name: found.name, from: other.name }
  }
  return { name: templateBeatName(key) }
}

// ── The overlay ─────────────────────────────────────────────────────────────

export interface PlacedChapter {
  id: string
  number: number
  title: string | null
  word_target: number | null
  template_beat_key: string | null
}

export interface ChapterSegment<C extends PlacedChapter = PlacedChapter> {
  chapter: C
  /** Fractions of the book, 0 to 1. */
  start: number
  end: number
}

export interface BeatPlacement<C extends PlacedChapter = PlacedChapter> {
  beat: StructureBeat
  /** 0-based, in story order. */
  index: number
  /** Where it should land, as a fraction of the book. */
  at: number
  /** The chapters marked as this moment. */
  mapped: C[]
  /** The chapter that spans `at`. */
  spanning: C | null
}

export interface StructureOverlay<C extends PlacedChapter = PlacedChapter> {
  segments: ChapterSegment<C>[]
  /** What the positions measure: word count targets, or chapters when no chapter has a target. */
  basis: "targets" | "chapters"
  placements: BeatPlacement<C>[]
}

/**
 * Where each of a structure's moments should land in the book, and which chapters deliver them. Positions are a share
 * of the book's word count targets; chapters without a target count as an average one. When no chapter has a target,
 * every chapter counts the same.
 */
export function overlayStructure<C extends PlacedChapter>(
  structure: StoryStructure,
  chapters: readonly C[],
): StructureOverlay<C> {
  const targets = chapters.map((chapter) => chapter.word_target ?? 0).filter((target) => target > 0)
  const basis = targets.length > 0 ? "targets" : "chapters"
  const average = targets.length > 0 ? targets.reduce((sum, target) => sum + target, 0) / targets.length : 1
  const sizes = chapters.map((chapter) =>
    basis === "chapters" ? 1 : (chapter.word_target ?? 0) > 0 ? chapter.word_target! : average,
  )
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const segments: ChapterSegment<C>[] = []
  let covered = 0
  chapters.forEach((chapter, index) => {
    const start = covered / total
    covered += sizes[index]
    segments.push({ chapter, start, end: index === chapters.length - 1 ? 1 : covered / total })
  })

  const placements = structure.beats.map((item, index): BeatPlacement<C> => {
    const at = Math.min(1, Math.max(0, item.pct / 100))
    const spanning = segments.find((segment) => at >= segment.start && at < segment.end) ?? segments.at(-1)
    return {
      beat: item,
      index,
      at,
      mapped: chapters.filter((chapter) => chapter.template_beat_key === item.key),
      spanning: spanning?.chapter ?? null,
    }
  })
  return { segments, basis, placements }
}

// ── Scaffolding a new book ──────────────────────────────────────────────────

export interface ScaffoldChapter {
  title: string
  beatKey: string
  wordTarget: number
}

export interface ScaffoldAct {
  title: string
  chapters: ScaffoldChapter[]
}

const roundTarget = (words: number) => Math.max(100, Math.round(words / 100) * 100)

/** A chapter's word count target when `count` chapters share the book's, to the nearest hundred. */
export const shareOfTarget = (bookTarget: number | null, count: number, fallback: number) =>
  bookTarget && bookTarget > 0 && count > 0 ? roundTarget(bookTarget / count) : fallback

/**
 * A new book's acts and chapters from a structure: a chapter per structure moment, titled after it, in the act
 * whose stretch of the book it falls in. A structure without acts gives one group with no title.
 */
export function scaffoldStructure(structure: StoryStructure, bookTarget: number | null, fallbackTarget: number) {
  const perChapter = shareOfTarget(bookTarget, structure.beats.length, fallbackTarget)
  const acts: ScaffoldAct[] = structure.acts.length
    ? [...structure.acts].sort((a, b) => a.pct - b.pct).map((act) => ({ title: act.title, chapters: [] }))
    : [{ title: "", chapters: [] }]
  const starts = [...structure.acts].sort((a, b) => a.pct - b.pct).map((act) => act.pct)
  for (const item of structure.beats) {
    let actIndex = 0
    starts.forEach((start, index) => {
      if (item.pct >= start) actIndex = index
    })
    acts[actIndex].chapters.push({ title: item.name, beatKey: item.key, wordTarget: perChapter })
  }
  return { acts: acts.filter((act) => act.chapters.length > 0), hasActs: structure.acts.length > 0 }
}

// ── Custom structures and their files ───────────────────────────────────────

export const STRUCTURE_FILE_FORMAT = "bookbookbook-structure"
const MAX_BEATS = 60
const MAX_NAME = 120
const MAX_DESCRIPTION = 2000

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "")

const clampPct = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 10) / 10)) : 0
}

/** A short, unique key for a custom structure moment. */
export function newBeatKey(name: string, taken: ReadonlySet<string>): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "moment"
  let key = slug
  for (let n = 2; taken.has(key); n++) key = `${slug}_${n}`
  return key
}

export interface StructureDraft {
  name: string
  acts: StructureAct[]
  beats: StructureBeat[]
}

/**
 * Cleans up a structure from a file or the editor: trims and caps text, keeps percentages within 0–100, gives
 * every moment a unique key (keeping the ones it has), and drops moments without a name. Null if nothing usable.
 */
export function normalizeStructure(input: unknown): StructureDraft | null {
  if (!input || typeof input !== "object") return null
  const raw = input as { name?: unknown; acts?: unknown; beats?: unknown }
  if (!Array.isArray(raw.beats)) return null
  const taken = new Set<string>()
  const beats: StructureBeat[] = []
  for (const item of raw.beats.slice(0, MAX_BEATS) as unknown[]) {
    if (!item || typeof item !== "object") continue
    const fields = item as Record<string, unknown>
    const name = text(fields.name, MAX_NAME)
    if (!name) continue
    const wanted = text(fields.key, 60)
    const key = wanted && !taken.has(wanted) && /^[\w-]+$/.test(wanted) ? wanted : newBeatKey(name, taken)
    taken.add(key)
    beats.push({ key, name, pct: clampPct(fields.pct), description: text(fields.description, MAX_DESCRIPTION) })
  }
  if (beats.length === 0) return null
  const acts: StructureAct[] = Array.isArray(raw.acts)
    ? (raw.acts as unknown[])
        .filter((act): act is Record<string, unknown> => !!act && typeof act === "object")
        .map((act) => ({ title: text(act.title, MAX_NAME), pct: clampPct(act.pct) }))
        .filter((act) => act.title)
        .slice(0, 12)
    : []
  return { name: text(raw.name, MAX_NAME) || "Untitled structure", acts, beats }
}

/** Reads a shared structure file. Throws a sentence for the writer when it isn't one. */
export function parseStructureFile(source: string): StructureDraft {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error("That file isn't a structure: it isn't JSON.")
  }
  const format = (value as { format?: unknown } | null)?.format
  if (format !== undefined && format !== STRUCTURE_FILE_FORMAT) {
    throw new Error("That file isn't a bookbookbook structure.")
  }
  const draft = normalizeStructure(value)
  if (!draft) throw new Error("That file has no structure moments in it.")
  return draft
}

/** The most a structure file can be. One at every limit above takes well under this. */
export const MAX_STRUCTURE_FILE_BYTES = 1_000_000

/** Reads a structure from a file the writer picked, without reading one far too big to be a structure. */
export async function readStructureFile(file: Blob): Promise<StructureDraft> {
  if (file.size > MAX_STRUCTURE_FILE_BYTES) throw new Error("That file is too big to be a structure.")
  return parseStructureFile(await file.text())
}

/** The file a structure is shared as. */
export function structureFile(structure: Pick<StoryStructure, "name" | "acts" | "beats">): string {
  const file = {
    format: STRUCTURE_FILE_FORMAT,
    version: 1,
    name: structure.name,
    acts: structure.acts,
    beats: structure.beats.map(({ key, name, pct, description }) => ({ key, name, pct, description })),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/** A `templates` row as a structure. Null when its beats can't be read. */
export function structureFromRow(row: {
  id: string
  name: string | null
  beats: string | null
}): StoryStructure | null {
  let stored: unknown
  try {
    stored = JSON.parse(row.beats ?? "")
  } catch {
    return null
  }
  // The row's `beats` column holds `{acts, beats}`; a bare array is beats alone.
  const shape = Array.isArray(stored) ? { beats: stored } : (stored as object)
  const draft = normalizeStructure({ ...shape, name: row.name })
  if (!draft) return null
  return {
    key: customKey(row.id),
    name: draft.name,
    summary: `Your own structure, ${draft.beats.length} ${draft.beats.length === 1 ? "moment" : "moments"}.`,
    acts: draft.acts,
    beats: draft.beats,
    templateId: row.id,
  }
}

/** What a custom structure stores in its `templates.beats` column. */
export const structureColumn = (draft: Pick<StructureDraft, "acts" | "beats">) =>
  JSON.stringify({ acts: draft.acts, beats: draft.beats })
