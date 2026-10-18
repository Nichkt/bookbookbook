import { charsForTokens, estimateTokens, formatTokens } from "./tokens"
import { PLACEHOLDER_ALIASES, PLACEHOLDERS, type FieldValues, type ToolDef, type ToolText } from "./tools"

/*
 * Builds each request's prompt from prioritized slots (DESIGN.md §9 "Context assembly") and trims the least important
 * when it won't fit the model's context window. Pure, so the context preview shows exactly what's sent and tests can
 * pin the trimming down.
 */

export const SLOT_IDS = [
  "instructions",
  "book",
  "text",
  "chapter",
  "always",
  "mentioned",
  "voices",
  "story",
  "samples",
] as const
export type SlotId = (typeof SLOT_IDS)[number]

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = {
  instructions: "What the tool is asked to do",
  book: "About the book and your style guide",
  text: "Your text",
  chapter: "This chapter's summary and moments",
  always: "World entries set to Always",
  mentioned: "World entries your text mentions",
  voices: "Voices of the characters in the scene",
  story: "Earlier chapters' summaries",
  samples: "Your sample passages",
}

/** What every request needs, so it can't be turned off. */
export const LOCKED_SLOTS: ReadonlySet<SlotId> = new Set<SlotId>(["instructions", "book", "text"])

const isSlotId = (value: unknown): value is SlotId => (SLOT_IDS as readonly unknown[]).includes(value)

/** The slots the writer turned off, from the `ai.slots` pref. */
export function parseSlotsOff(raw: string | null | undefined): Set<SlotId> {
  if (!raw) return new Set()
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return new Set()
  }
  if (!Array.isArray(value)) return new Set()
  return new Set(value.filter((id): id is SlotId => isSlotId(id) && !LOCKED_SLOTS.has(id)))
}

export const serializeSlotsOff = (off: ReadonlySet<SlotId>) =>
  JSON.stringify(SLOT_IDS.filter((id) => off.has(id) && !LOCKED_SLOTS.has(id)))

export interface BookFacts {
  title: string
  genre: string
  audience: string
  pov: string
  tense: string
  premise: string
  synopsis: string
  styleGuide: string
  /** Passages in the author's own words, separated by blank lines. */
  samples: string
}

export interface Moment {
  text: string
  done: boolean
}

export interface ChapterFacts {
  /** "Chapter 3: The ferry". */
  label: string
  summary: string
  moments: readonly Moment[]
  /** The first moment that isn't done. */
  next: string | null
  pov?: string
  present?: readonly string[]
  location?: string
}

export interface StoryChapter {
  label: string
  summary: string
}

export interface WorldItem {
  id: string
  name: string
  /** "Character"; empty for entries without a type. */
  type: string
  aliases: readonly string[]
  /** Label and value, in the entry's order. */
  fields: readonly (readonly [string, string])[]
  notes: string
}

export interface CharacterVoice {
  name: string
  voice: string
}

export interface ContextInput {
  tool: ToolDef
  fields: FieldValues
  book: BookFacts
  chapter: ChapterFacts | null
  /** Earlier chapters, in reading order. */
  story: readonly StoryChapter[]
  always: readonly WorldItem[]
  /** Most-mentioned first. */
  mentioned: readonly WorldItem[]
  voices: readonly CharacterVoice[]
  text: ToolText
  /** Names in the World, for the name generator to avoid. */
  names: readonly string[]
  slotsOff: ReadonlySet<SlotId>
  /** The model's context window, in tokens. */
  contextTokens: number
}

export interface SlotReport {
  id: SlotId
  label: string
  /** As sent, after trimming. */
  tokens: number
  /** Passages, chapters or entries it had to offer; 1 for the text, the chapter or the book. */
  items: number
  /** How many were left out to fit; for the text, 1 when it was shortened. */
  dropped: number
  /** Turned off by the writer. */
  off: boolean
  locked: boolean
  /** Whether anything from it went in. */
  used: boolean
}

/** How much of a slot goes in, or why none of it does, as the context preview says. */
export function slotDetail(slot: SlotReport): string {
  if (slot.off) return "Off"
  if (slot.items === 0) return "None"
  if (slot.tokens === 0) return slot.dropped > 0 ? "Left out to fit" : "None"
  const size = `${formatTokens(slot.tokens)} tokens`
  if (slot.dropped === 0) return size
  if (slot.id === "text" || slot.id === "chapter") return `${size}, shortened to fit`
  return `${size}, ${slot.dropped} of ${slot.items} left out to fit`
}

export interface BuiltPrompt {
  system: string
  user: string
  /** Room for the answer, in tokens. */
  maxTokens: number
  /** The slots this tool reads, in priority order. */
  slots: SlotReport[]
  /** The whole prompt. */
  tokens: number
  /** What the prompt may take: the context window, less room for the answer and a margin. */
  budget: number
  /** Whether anything was left out or shortened to fit. */
  trimmed: boolean
  /** Even trimmed, it doesn't fit, so the request can't go. */
  tooBig: boolean
}

export const BASE_ROLE =
  "You're a writing assistant helping a novelist with their own book, a work of fiction. Novels often deal with " +
  "dark material such as violence, crime and cruelty: treat it as part of the story and handle it as a skilled " +
  "novelist would. Match the author's voice, point of view and tense, and stay consistent with what the book has " +
  "set down. Reply with only what is asked for: no preamble, no notes, no quotation marks around the answer."

/** An entry's notes can run long: past this, the rest is cut. */
const WORLD_ITEM_CHARS = 2000
/** Shorter than this, the text after the caret isn't worth sending. */
const MIN_AFTER = 100
/** Trimming never cuts the text before the caret, or a chapter's text, below these. */
const MIN_BEFORE = 400
const MIN_CHAPTER = 1000
/** The share of the budget the text around the caret may take, so a small model still gets the plan and World. */
const TEXT_SHARE = 0.6

const lines = (...parts: unknown[]) => parts.filter((part): part is string => typeof part === "string" && !!part)
const block = (...parts: unknown[]) => lines(...parts).join("\n")
const tag = (name: string, body: string) => (body ? `<${name}>\n${body}\n</${name}>` : "")

/** About `keep` characters from the end, starting at a word, after "…". */
export function cutStart(text: string, keep: number): string {
  if (text.length <= keep) return text
  let start = text.length - Math.max(0, keep)
  const space = text.slice(start, start + 40).search(/\s/)
  if (space >= 0) start += space
  return `…${text.slice(start).trimStart()}`
}

/** About `keep` characters from the start, ending at a word, then "…". */
export function cutEnd(text: string, keep: number): string {
  if (text.length <= keep) return text
  const from = Math.max(0, keep - 40)
  const space = text.slice(from, keep).search(/\s\S*$/)
  const end = space >= 0 ? from + space : Math.max(0, keep)
  return `${text.slice(0, end).trimEnd()}…`
}

/** The sample passages, one per paragraph. */
export const samplePassages = (samples: string) =>
  samples
    .split(/\n\s*\n/)
    .map((passage) => passage.trim())
    .filter(Boolean)

function bookFacts(book: BookFacts): string {
  const facts: [string, string][] = [
    ["Title", book.title],
    ["Genre", book.genre],
    ["Audience", book.audience],
    ["Point of view", book.pov],
    ["Tense", book.tense],
    ["Premise", book.premise],
    ["Synopsis", book.synopsis],
  ]
  const known = facts.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`)
  const guide = book.styleGuide.trim()
  return lines(known.join("\n"), guide && `## Style guide\n${guide}`).join("\n\n")
}

const bookSection = (book: BookFacts) => {
  const facts = bookFacts(book)
  return facts && `# About the book\n${facts}`
}

const storySection = (story: readonly StoryChapter[]) =>
  story.length > 0
    ? `# Story so far\n${story.map((chapter) => `## ${chapter.label}\n${chapter.summary.trim()}`).join("\n\n")}`
    : ""

const momentList = (moments: readonly Moment[]) =>
  moments
    .filter((moment) => moment.text.trim())
    .map((moment) => `- [${moment.done ? "x" : " "}] ${moment.text.trim()}`)
    .join("\n")

function chapterSection(chapter: ChapterFacts | null, tool: ToolDef): string {
  if (!chapter) return ""
  const moments = momentList(chapter.moments)
  return block(
    "# This chapter",
    chapter.label,
    chapter.pov && `Point of view: ${chapter.pov}`,
    chapter.present && chapter.present.length > 0 && `Characters present: ${chapter.present.join(", ")}`,
    chapter.location && `Where: ${chapter.location}`,
    chapter.summary.trim() && `Summary: ${chapter.summary.trim()}`,
    moments && `Moments, in order (the checked ones are written):\n${moments}`,
    tool.nextMoment && chapter.next && `Next moment to write toward: ${chapter.next}`,
  )
}

export function worldItemText(item: WorldItem): string {
  const text = block(
    item.type ? `## ${item.name} (${item.type})` : `## ${item.name}`,
    item.aliases.length > 0 && `Also called: ${item.aliases.join(", ")}`,
    ...item.fields.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`),
    item.notes.trim(),
  )
  return cutEnd(text, WORLD_ITEM_CHARS)
}

const worldItems = (items: readonly WorldItem[]) => items.map(worldItemText).join("\n\n")

function worldSection(always: readonly WorldItem[], mentioned: readonly WorldItem[]): string {
  if (always.length + mentioned.length === 0) return ""
  return (
    "# World\nWhat the author has set down about the story's world. Stay consistent with it.\n\n" +
    worldItems([...always, ...mentioned])
  )
}

const voicesSection = (voices: readonly CharacterVoice[]) =>
  voices.length > 0
    ? `# Character voices\n${voices.map((voice) => `## ${voice.name}\n${voice.voice.trim()}`).join("\n\n")}`
    : ""

const samplesSection = (passages: readonly string[]) =>
  passages.length > 0
    ? "# The author's style\nPassages the author wrote, to show their voice and rhythm. Use them for style only, " +
      `not content.\n${tag("samples", passages.join("\n\n"))}`
    : ""

/** Whether a tool reads the writer's text: the name generator doesn't. */
const readsText = (tool: ToolDef) => tool.input !== "caret" || tool.window.before > 0 || tool.window.after > 0

const selectionForm = (tool: ToolDef, text: ToolText) =>
  tool.input === "selection" || (tool.input === "subject" && text.selection.trim() !== "")

function textSection(tool: ToolDef, text: ToolText): string {
  if (tool.input === "chapter") return block("# The chapter", tag("chapter", text.chapter))
  if (selectionForm(tool, text)) {
    return block(
      "# The text",
      tag("text_before", text.before),
      tag("selected_text", text.selection),
      tag("text_after", text.after),
    )
  }
  if (!readsText(tool)) return ""
  return block(
    "# The text",
    text.before.trim()
      ? tag("text_before_caret", text.before)
      : "The scene has no text before the caret yet: this is where it starts.",
    tag("text_after_caret", text.after),
  )
}

const hasText = (text: ToolText) => !!(text.before || text.selection || text.after || text.chapter)
const sameText = (a: ToolText, b: ToolText) => a.before === b.before && a.after === b.after && a.chapter === b.chapter

/**
 * One round of shortening the writer's text by about `excess` characters: the text after the caret first (left out
 * when little would be left), then the text before it from the start, then a chapter's text from the end. The
 * selection is never cut.
 */
export function shortenText(text: ToolText, excess: number): ToolText {
  let { before, after, chapter } = text
  let left = excess
  if (left > 0 && after) {
    if (after.length - left < MIN_AFTER) {
      left -= after.length
      after = ""
    } else {
      after = cutEnd(after, after.length - left)
      left = 0
    }
  }
  if (left > 0 && before.length > MIN_BEFORE) {
    const keep = Math.max(MIN_BEFORE, before.length - left)
    left -= before.length - keep
    before = cutStart(before, keep)
  }
  if (left > 0 && chapter.length > MIN_CHAPTER) chapter = cutEnd(chapter, Math.max(MIN_CHAPTER, chapter.length - left))
  return { ...text, before, after, chapter }
}

/** The text around the caret, kept to its share of the budget. */
function windowed(text: ToolText, budget: number): ToolText {
  const room = charsForTokens(Math.floor(budget * TEXT_SHARE))
  if (text.before.length + text.after.length <= room) return text
  let after = text.after
  if (after.length > room * 0.1) {
    const keep = Math.floor(room * 0.1)
    after = keep < MIN_AFTER ? "" : cutEnd(after, keep)
  }
  return { ...text, after, before: cutStart(text.before, Math.max(MIN_BEFORE, room - after.length)) }
}

/** Room for the answer: the tool's, but never more than half the window. */
const answerRoom = (wanted: number, contextTokens: number) =>
  Math.max(64, Math.min(wanted, Math.floor(contextTokens / 2)))

export const budgetFor = (contextTokens: number, maxTokens: number) =>
  Math.max(500, Math.floor((contextTokens - maxTokens) * 0.9))

/** The slots a tool reads, in priority order. */
export function slotsFor(tool: ToolDef): SlotId[] {
  if (tool.template !== undefined) return ["instructions", "book", "text", "chapter", "always", "mentioned"]
  return SLOT_IDS.filter((id) => (id === "voices" ? !!tool.voices : id === "text" ? readsText(tool) : true))
}

const SECTION_ORDER = ["book", "story", "chapter", "world", "voices", "samples", "text", "task"] as const
type Sections = Record<(typeof SECTION_ORDER)[number], string>

const joinSections = (sections: Sections) => lines(...SECTION_ORDER.map((key) => sections[key])).join("\n\n")

function sectionsLength(sections: Sections) {
  let length = 0
  let count = 0
  for (const key of SECTION_ORDER) {
    if (!sections[key]) continue
    length += sections[key].length
    count++
  }
  return length + Math.max(0, count - 1) * 2
}

const zeroes = () => Object.fromEntries(SLOT_IDS.map((id) => [id, 0])) as Record<SlotId, number>

export function buildPrompt(input: ContextInput): BuiltPrompt {
  return input.tool.template === undefined ? buildToolPrompt(input) : buildTemplatePrompt(input)
}

function buildToolPrompt(input: ContextInput): BuiltPrompt {
  const { tool, fields, book } = input
  const maxTokens = answerRoom(tool.maxTokens(fields, input.text), input.contextTokens)
  const budget = budgetFor(input.contextTokens, maxTokens)
  const system = `${BASE_ROLE}\n\n${tool.instructions(fields)}`
  const reads = new Set(slotsFor(tool))
  const isOn = (id: SlotId) => reads.has(id) && (LOCKED_SLOTS.has(id) || !input.slotsOff.has(id))

  const alwaysIds = new Set(input.always.map((item) => item.id))
  const offered = {
    samples: samplePassages(book.samples),
    story: input.story.filter((chapter) => chapter.summary.trim()),
    voices: input.voices.filter((voice) => voice.voice.trim()),
    always: [...input.always],
    mentioned: input.mentioned.filter((item) => !alwaysIds.has(item.id)),
  }
  const parts = {
    samples: isOn("samples") ? [...offered.samples] : [],
    story: isOn("story") ? [...offered.story] : [],
    voices: isOn("voices") ? [...offered.voices] : [],
    always: isOn("always") ? [...offered.always] : [],
    mentioned: isOn("mentioned") ? [...offered.mentioned] : [],
    chapter: isOn("chapter") ? input.chapter : null,
    text: tool.input === "chapter" ? input.text : windowed(input.text, budget),
  }
  const dropped = zeroes()
  const sections: Sections = {
    book: bookSection(book),
    story: storySection(parts.story),
    chapter: chapterSection(parts.chapter, tool),
    world: worldSection(parts.always, parts.mentioned),
    voices: voicesSection(parts.voices),
    samples: samplesSection(parts.samples),
    text: textSection(tool, parts.text),
    task: `# Your task\n${tool.task(fields, input.text, { names: input.names })}`,
  }
  const systemTokens = estimateTokens(system)
  const total = () => systemTokens + Math.ceil(sectionsLength(sections) / 4)
  const over = () => total() > budget

  while (over() && parts.samples.length > 0) {
    parts.samples.pop()
    dropped.samples++
    sections.samples = samplesSection(parts.samples)
  }
  while (over() && parts.story.length > 0) {
    parts.story.shift()
    dropped.story++
    sections.story = storySection(parts.story)
  }
  while (over() && parts.voices.length > 0) {
    parts.voices.pop()
    dropped.voices++
    sections.voices = voicesSection(parts.voices)
  }
  for (const id of ["mentioned", "always"] as const) {
    while (over() && parts[id].length > 0) {
      parts[id].pop()
      dropped[id]++
      sections.world = worldSection(parts.always, parts.mentioned)
    }
  }
  const dropChapter = () => {
    if (!over() || !parts.chapter) return
    parts.chapter = null
    dropped.chapter = 1
    sections.chapter = ""
  }
  const cutText = () => {
    for (let round = 0; round < 3 && over(); round++) {
      const shorter = shortenText(parts.text, (total() - budget) * 4 + 16)
      if (sameText(shorter, parts.text)) return
      parts.text = shorter
      dropped.text = 1
      sections.text = textSection(tool, parts.text)
    }
  }
  // Drafting from moments is pointless without them, so its text gives way first.
  if (tool.id === "draft") {
    cutText()
    dropChapter()
  } else {
    dropChapter()
    cutText()
  }

  const user = joinSections(sections)
  const tokens = systemTokens + estimateTokens(user)
  const slotTokens: Record<SlotId, number> = {
    instructions: systemTokens + estimateTokens(sections.task),
    book: estimateTokens(sections.book),
    text: estimateTokens(sections.text),
    chapter: estimateTokens(sections.chapter),
    always: estimateTokens(worldItems(parts.always)),
    mentioned: estimateTokens(worldItems(parts.mentioned)),
    voices: estimateTokens(sections.voices),
    story: estimateTokens(sections.story),
    samples: estimateTokens(sections.samples),
  }
  const items: Record<SlotId, number> = {
    instructions: 1,
    book: 1,
    text: hasText(input.text) ? 1 : 0,
    chapter: input.chapter ? 1 : 0,
    always: offered.always.length,
    mentioned: offered.mentioned.length,
    voices: offered.voices.length,
    story: offered.story.length,
    samples: offered.samples.length,
  }
  const slots = [...reads].map(
    (id): SlotReport => ({
      id,
      label: SLOT_LABELS[id],
      tokens: slotTokens[id],
      items: items[id],
      dropped: dropped[id],
      off: !LOCKED_SLOTS.has(id) && input.slotsOff.has(id),
      locked: LOCKED_SLOTS.has(id),
      used: slotTokens[id] > 0,
    }),
  )
  return {
    system,
    user,
    maxTokens,
    slots,
    tokens,
    budget,
    trimmed: SLOT_IDS.some((id) => dropped[id] > 0),
    tooBig: tokens > budget,
  }
}

const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(PLACEHOLDERS.map((placeholder) => placeholder.name))
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g

const canonical = (name: string) => {
  const lower = name.toLowerCase()
  return PLACEHOLDER_ALIASES[lower] ?? lower
}

/** The placeholders a template uses, by their current names. */
export function placeholdersIn(template: string): Set<string> {
  const names = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = canonical(match[1])
    if (PLACEHOLDER_NAMES.has(name)) names.add(name)
  }
  return names
}

/** `{words}` in a template that the app won't fill in, as written. */
export function unknownPlaceholders(template: string): string[] {
  const unknown = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!PLACEHOLDER_NAMES.has(canonical(match[1]))) unknown.add(match[0])
  }
  return [...unknown]
}

export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER_PATTERN, (whole, name: string) => values[canonical(name)] ?? whole)
}

/** A custom tool's prompt: its template, filled in. Its slots follow the placeholders, not the writer's toggles. */
function buildTemplatePrompt(input: ContextInput): BuiltPrompt {
  const { tool, fields } = input
  const template = tool.template ?? ""
  const uses = placeholdersIn(template)
  const maxTokens = answerRoom(tool.maxTokens(fields, input.text), input.contextTokens)
  const budget = budgetFor(input.contextTokens, maxTokens)
  const system = `${BASE_ROLE}\n\n${tool.instructions(fields)}`
  const alwaysIds = new Set(input.always.map((item) => item.id))
  const offeredAlways = uses.has("world") ? [...input.always] : []
  const offeredMentioned = uses.has("world") ? input.mentioned.filter((item) => !alwaysIds.has(item.id)) : []
  const always = [...offeredAlways]
  const mentioned = [...offeredMentioned]
  let text = windowed(input.text, budget)
  const dropped = zeroes()
  const chapter = input.chapter
  const values = () => ({
    selection: text.selection,
    before: text.before,
    after: text.after,
    summary: chapter?.summary.trim() ?? "",
    moments: chapter ? momentList(chapter.moments) : "",
    world: worldItems([...always, ...mentioned]),
    style: bookFacts(input.book),
  })
  let user = fillTemplate(template, values())
  const systemTokens = estimateTokens(system)
  const total = () => systemTokens + estimateTokens(user)

  for (const [id, list] of [
    ["mentioned", mentioned],
    ["always", always],
  ] as const) {
    while (total() > budget && list.length > 0) {
      list.pop()
      dropped[id]++
      user = fillTemplate(template, values())
    }
  }
  for (let round = 0; round < 3 && total() > budget; round++) {
    const shorter = shortenText(text, (total() - budget) * 4 + 16)
    if (sameText(shorter, text)) break
    text = shorter
    dropped.text = 1
    user = fillTemplate(template, values())
  }

  const filled = values()
  const tokens = total()
  const textNames = ["selection", "before", "after"] as const
  const tokensOf = (name: keyof typeof filled) => (uses.has(name) ? estimateTokens(filled[name]) : 0)
  const slotTokens: Record<SlotId, number> = {
    ...zeroes(),
    instructions: systemTokens,
    book: tokensOf("style"),
    text: textNames.reduce((sum, name) => sum + tokensOf(name), 0),
    chapter: tokensOf("summary") + tokensOf("moments"),
    always: estimateTokens(worldItems(always)),
    mentioned: estimateTokens(worldItems(mentioned)),
  }
  const items: Record<SlotId, number> = {
    ...zeroes(),
    instructions: 1,
    book: uses.has("style") ? 1 : 0,
    text: textNames.some((name) => uses.has(name)) && hasText(input.text) ? 1 : 0,
    chapter: (uses.has("summary") || uses.has("moments")) && chapter ? 1 : 0,
    always: offeredAlways.length,
    mentioned: offeredMentioned.length,
  }
  const slots = slotsFor(tool).map(
    (id): SlotReport => ({
      id,
      label: SLOT_LABELS[id],
      tokens: slotTokens[id],
      items: items[id],
      dropped: dropped[id],
      off: false,
      locked: true,
      used: slotTokens[id] > 0,
    }),
  )
  return {
    system,
    user,
    maxTokens,
    slots,
    tokens,
    budget,
    trimmed: SLOT_IDS.some((id) => dropped[id] > 0),
    tooBig: tokens > budget,
  }
}
