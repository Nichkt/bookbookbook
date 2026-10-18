import { estimateTokens, tokensForWords } from "./tokens"

/*
 * The AI tools (DESIGN.md §9 "Tools"): what each reads, what it asks for, and what kind of answer comes back, which
 * decides how its card shows it. Prompts are plain text in the bundle, so the context preview shows exactly what's
 * sent.
 */

export type FieldValues = Readonly<Record<string, string>>

export interface ChoiceField {
  kind: "choice"
  key: string
  label: string
  options: readonly { value: string; label: string }[]
  initial: string
  /** Glossary terms for options that need explaining, offered beside the field while one is chosen. */
  terms?: Readonly<Record<string, string>>
}

export interface TextField {
  kind: "text"
  key: string
  label: string
  placeholder: string
  multiline?: boolean
  /** Shown only while another field has this value. */
  when?: { key: string; value: string }
}

export type ToolField = ChoiceField | TextField

/** What a tool works on: the caret, the selection, a subject (typed, else the selection), or the whole chapter. */
export type ToolInput = "caret" | "selection" | "subject" | "chapter"
/** What its answer is. */
export type ToolOutput = "prose" | "senses" | "ideas" | "names" | "summary" | "feedback"
export type ToolGroup = "Write" | "Revise" | "Plan" | "Your tools"
export const TOOL_GROUPS: readonly ToolGroup[] = ["Write", "Revise", "Plan", "Your tools"]

/** The writer's text a request carries. */
export interface ToolText {
  before: string
  selection: string
  after: string
  /** The chapter's whole text, for the tools that read it all. */
  chapter: string
}

export const NO_TEXT: ToolText = { before: "", selection: "", after: "", chapter: "" }

/** What else a task can mention. */
export interface TaskInfo {
  /** Names already in the World, for the name generator to steer clear of. */
  names: readonly string[]
}

export interface ToolDef {
  /** A built-in id, or `custom:<row id>`. */
  id: string
  name: string
  group: ToolGroup
  /** One line in the panel, under the tool picker. */
  blurb: string
  input: ToolInput
  output: ToolOutput
  /** Answers per run, each its own request, to pick from. */
  variants: number
  fields: readonly ToolField[]
  /** How much text it reads around the caret or selection, in characters. */
  window: { before: number; after: number }
  /** Where its prose goes: at the caret, over the selection, or nowhere (its card has other actions). */
  placement: "insert" | "replace" | null
  /** Whether the chapter's next moment that isn't done is called out. */
  nextMoment?: boolean
  /** Whether the voices of characters named in the selection go in. */
  voices?: boolean
  /** A custom tool's prompt, with {placeholders}: it replaces the usual layout. */
  template?: string
  maxTokens(fields: FieldValues, text: ToolText): number
  /** The tool's part of the system message. */
  instructions(fields: FieldValues): string
  /** The request itself, the last part of the user message. */
  task(fields: FieldValues, text: ToolText, info: TaskInfo): string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))
/** Room to answer with a version of the selection `factor` times as long. */
const selectionRoom = (text: ToolText, factor: number, min: number, max: number) =>
  clamp(estimateTokens(text.selection) * factor + 200, min, max)

const KEEP_FITTING =
  "Keep the author's voice, tense and point of view, and keep it fitting with the text before and after it. " +
  "Reply with the new version of the selected text only."

const LENGTHS = [
  { value: "short", label: "Short (about 100 words)", words: 100 },
  { value: "medium", label: "Medium (about 250 words)", words: 250 },
  { value: "long", label: "Long (about 500 words)", words: 500 },
] as const
const wordsFor = (value: string | undefined) => (LENGTHS.find((length) => length.value === value) ?? LENGTHS[1]).words

const continueTool: ToolDef = {
  id: "continue",
  name: "Continue",
  group: "Write",
  blurb: "Writes what comes next, from your cursor, in your style.",
  input: "caret",
  output: "prose",
  variants: 2,
  fields: [
    { kind: "choice", key: "length", label: "Length", options: LENGTHS, initial: "medium" },
    {
      kind: "text",
      key: "direction",
      label: "What should happen (optional)",
      placeholder: "Jonas lies about the debt",
    },
  ],
  window: { before: 12_000, after: 1_200 },
  placement: "insert",
  nextMoment: true,
  maxTokens: (fields) => tokensForWords(wordsFor(fields.length)),
  instructions: (fields) =>
    `Continue the story from exactly where the text before the caret stops, in about ${wordsFor(fields.length)} ` +
    "words. If it stops mid-sentence, finish the sentence. Don't repeat or sum up what came before, don't end the " +
    "chapter, and stop at a natural pause. If there's text after the caret, lead toward it without repeating it.",
  task: (fields) => {
    const direction = fields.direction?.trim()
    return direction
      ? `Continue the story from the caret. What should happen: ${direction}`
      : "Continue the story from the caret."
  },
}

const PRESETS = [
  {
    value: "rephrase",
    label: "Rephrase",
    ask: "Rephrase the selected text: the same meaning and about the same length, in fresh words.",
  },
  {
    value: "vivid",
    label: "More vivid",
    ask: "Make the selected text more vivid: sharper verbs, concrete sensory detail, fewer abstractions.",
  },
  {
    value: "show",
    label: "Show, don't tell",
    ask:
      "Rewrite the selected text to show rather than tell: turn stated feelings and summary into action, " +
      "sensory detail, body language and dialogue.",
  },
  {
    value: "tension",
    label: "More tension",
    ask: "Rewrite the selected text with more tension: raise the stakes, tighten the pacing, add friction or unease.",
  },
  {
    value: "shorter",
    label: "Shorter",
    ask: "Make the selected text shorter and tighter: cut repetition and filler, keeping every story beat.",
  },
  { value: "custom", label: "My own instruction", ask: "Rewrite the selected text as the author asks." },
] as const

const rewriteTool: ToolDef = {
  id: "rewrite",
  name: "Rewrite",
  group: "Revise",
  blurb: "Rewrites the text you select, three ways.",
  input: "selection",
  output: "prose",
  variants: 3,
  fields: [
    {
      kind: "choice",
      key: "preset",
      label: "How",
      options: PRESETS.map(({ value, label }) => ({ value, label })),
      initial: "rephrase",
      terms: { show: "show-dont-tell" },
    },
    {
      kind: "text",
      key: "instruction",
      label: "Your instruction",
      placeholder: "Make Mara sound more tired",
      when: { key: "preset", value: "custom" },
    },
  ],
  window: { before: 4_000, after: 1_200 },
  placement: "replace",
  maxTokens: (_, text) => selectionRoom(text, 1.5, 256, 4096),
  instructions: (fields) => {
    const preset = PRESETS.find((option) => option.value === fields.preset) ?? PRESETS[0]
    return `${preset.ask} ${KEEP_FITTING}`
  },
  task: (fields) => {
    const instruction = fields.instruction?.trim()
    return fields.preset === "custom" && instruction
      ? `Rewrite the selected text. The author's instruction: ${instruction}`
      : "Rewrite the selected text."
  },
}

export const SENSES = ["Sight", "Sound", "Smell", "Taste", "Touch", "Metaphor"] as const

const describeTool: ToolDef = {
  id: "describe",
  name: "Describe",
  group: "Write",
  blurb: "Ideas for describing something, sense by sense, to pick from.",
  input: "subject",
  output: "senses",
  variants: 1,
  fields: [
    {
      kind: "text",
      key: "subject",
      label: "What to describe (or select it in the text)",
      placeholder: "the ferry at night",
    },
  ],
  window: { before: 2_000, after: 0 },
  placement: "insert",
  maxTokens: () => 700,
  instructions: () =>
    "Give the author ideas for describing the subject, as it appears in this story. Under each heading below, " +
    "write two or three short, concrete lines, each starting with “- ”. Use these headings, in this order, each on " +
    `its own line and followed by a colon: ${SENSES.join(", ")}. No other text.`,
  task: (fields, text) => `Describe ${fields.subject?.trim() || text.selection.trim()}`,
}

const expandTool: ToolDef = {
  id: "expand",
  name: "Expand",
  group: "Revise",
  blurb: "Makes the text you select longer and richer.",
  input: "selection",
  output: "prose",
  variants: 2,
  fields: [],
  window: { before: 4_000, after: 1_200 },
  placement: "replace",
  maxTokens: (_, text) => selectionRoom(text, 2.5, 400, 6000),
  instructions: () =>
    "Expand the selected text to about twice its length: add sensory detail, inner thoughts and small actions, " +
    `keeping every event and line of dialogue. ${KEEP_FITTING}`,
  task: () => "Expand the selected text.",
}

const condenseTool: ToolDef = {
  id: "condense",
  name: "Condense",
  group: "Revise",
  blurb: "Makes the text you select about half as long.",
  input: "selection",
  output: "prose",
  variants: 2,
  fields: [],
  window: { before: 4_000, after: 1_200 },
  placement: "replace",
  maxTokens: (_, text) => selectionRoom(text, 1, 200, 4096),
  instructions: () =>
    "Condense the selected text to about half its length, keeping every story beat and the best lines. " +
    KEEP_FITTING,
  task: () => "Condense the selected text.",
}

const dialogueTool: ToolDef = {
  id: "dialogue",
  name: "Dialogue polish",
  group: "Revise",
  blurb: "Makes the dialogue you select sound like each character.",
  input: "selection",
  output: "prose",
  variants: 2,
  fields: [],
  window: { before: 4_000, after: 1_200 },
  placement: "replace",
  voices: true,
  maxTokens: (_, text) => selectionRoom(text, 1.5, 256, 4096),
  instructions: () =>
    "Polish the dialogue in the selected text: make each character sound like themselves (see Character voices " +
    "when given), cut lines that say too plainly what a character feels, and add subtext. Keep the narration " +
    `between the lines unless a line needs a small action beside it. ${KEEP_FITTING}`,
  task: () => "Polish the dialogue in the selected text.",
}

const DRAFT_LENGTHS = [
  { value: "500", label: "About 500 words" },
  { value: "1000", label: "About 1,000 words" },
  { value: "2000", label: "About 2,000 words" },
] as const
const draftWords = (value: string | undefined) =>
  Number(DRAFT_LENGTHS.find((length) => length.value === value)?.value ?? 1000)

const draftTool: ToolDef = {
  id: "draft",
  name: "Draft from moments",
  group: "Write",
  blurb: "Drafts the chapter's next stretch from its moments, at your cursor.",
  input: "caret",
  output: "prose",
  variants: 1,
  fields: [{ kind: "choice", key: "length", label: "Length", options: DRAFT_LENGTHS, initial: "1000" }],
  window: { before: 8_000, after: 1_200 },
  placement: "insert",
  nextMoment: true,
  maxTokens: (fields) => tokensForWords(draftWords(fields.length)),
  instructions: (fields) =>
    `Draft the next part of this chapter as finished prose, about ${draftWords(fields.length)} words long. Work ` +
    "through the chapter's moments that aren't done yet, in order, picking up exactly where the text before the " +
    "caret stops. Write it as the novel itself, in scenes, not as notes or an outline.",
  task: () => "Draft the next part of the chapter from the caret.",
}

const CATEGORIES = [
  { value: "next", label: "What could happen next", ask: "ideas for what could happen next" },
  { value: "twists", label: "Plot twists", ask: "plot twists" },
  { value: "obstacles", label: "Obstacles", ask: "obstacles and complications for the characters" },
  { value: "characters", label: "Characters", ask: "new characters, each starting with a name and a colon" },
  { value: "places", label: "Places", ask: "places, each starting with a name and a colon" },
  { value: "details", label: "Telling details", ask: "small, telling details to make scenes feel real" },
  { value: "titles", label: "Chapter titles", ask: "titles for this chapter" },
  { value: "dialogue", label: "Lines of dialogue", ask: "lines of dialogue" },
] as const

/** Brainstorm categories whose ideas are things with names, for Add to World. */
export const NAMED_IDEAS = new Set(["characters", "places"])

const brainstormTool: ToolDef = {
  id: "brainstorm",
  name: "Brainstorm",
  group: "Plan",
  blurb: "Ten ideas to spark your own: twists, characters, titles and more.",
  input: "caret",
  output: "ideas",
  variants: 1,
  fields: [
    {
      kind: "choice",
      key: "category",
      label: "Ideas for",
      options: CATEGORIES.map(({ value, label }) => ({ value, label })),
      initial: "next",
    },
    { kind: "text", key: "prompt", label: "Anything to steer it (optional)", placeholder: "Something at sea" },
  ],
  window: { before: 4_000, after: 0 },
  placement: null,
  maxTokens: () => 1000,
  instructions: (fields) =>
    `Brainstorm ${(CATEGORIES.find((category) => category.value === fields.category) ?? CATEGORIES[0]).ask} for ` +
    "this story. Give 10 ideas as a numbered list, one or two sentences each, specific to this book and different " +
    "from each other. No other text.",
  task: (fields) => {
    const prompt = fields.prompt?.trim()
    const label = (CATEGORIES.find((category) => category.value === fields.category) ?? CATEGORIES[0]).label
    const ask = `Brainstorm: ${label.toLowerCase()}.`
    return prompt ? `${ask} Steer toward: ${prompt}` : ask
  },
}

const namesTool: ToolDef = {
  id: "names",
  name: "Name generator",
  group: "Plan",
  blurb: "Twelve names that fit your world and don't clash with the ones you have.",
  input: "caret",
  output: "names",
  variants: 1,
  fields: [
    { kind: "text", key: "kind", label: "Names for", placeholder: "fishermen from the north coast" },
    { kind: "text", key: "style", label: "Sound or culture (optional)", placeholder: "Welsh, short and hard" },
  ],
  window: { before: 0, after: 0 },
  placement: null,
  maxTokens: () => 600,
  instructions: () =>
    "Suggest 12 names that fit this book's world. Avoid the names it already has, names that sound like them, and " +
    "where you can, the same first letters. One per line, as: Name — a few words on its meaning or feel. " +
    "No other text.",
  task: (fields, _, info) => {
    const kind = fields.kind?.trim() || "characters"
    const style = fields.style?.trim()
    const avoid = info.names.length > 0 ? `\nNames already in the book: ${info.names.join(", ")}.` : ""
    return `Suggest names for ${kind}.${style ? ` Sound or culture: ${style}.` : ""}${avoid}`
  },
}

const summarizeTool: ToolDef = {
  id: "summarize",
  name: "Summarize chapter",
  group: "Plan",
  blurb: "Sums up the chapter and lists its moments, for your plan.",
  input: "chapter",
  output: "summary",
  variants: 1,
  fields: [],
  window: { before: 0, after: 0 },
  placement: null,
  maxTokens: () => 800,
  instructions: () =>
    "Summarize the chapter for the author's plan. Reply in exactly this form:\n" +
    "Summary: two or three sentences on what happens and what changes.\n" +
    "Moments:\n- each key moment, in order, as one short sentence\nNo other text.",
  task: () => "Summarize the chapter.",
}

export const FEEDBACK_HEADINGS = ["What works", "Pacing", "Clarity", "Character", "Continuity"] as const

const feedbackTool: ToolDef = {
  id: "feedback",
  name: "Chapter feedback",
  group: "Revise",
  blurb: "An editor's notes on the chapter: what works, pacing, clarity and more.",
  input: "chapter",
  output: "feedback",
  variants: 1,
  fields: [],
  window: { before: 0, after: 0 },
  placement: null,
  maxTokens: () => 1600,
  instructions: () =>
    "You're an experienced fiction editor giving the author honest, specific notes on this chapter. Use these " +
    `headings, each on its own line and followed by a colon: ${FEEDBACK_HEADINGS.join(", ")}. Under each, give a ` +
    "few short points starting with “- ”. Point at passages by quoting a few words. Be kind but direct, and don't " +
    "rewrite the chapter.",
  task: () => "Give your notes on the chapter.",
}

export const BUILTIN_TOOLS: readonly ToolDef[] = [
  continueTool,
  draftTool,
  describeTool,
  rewriteTool,
  expandTool,
  condenseTool,
  dialogueTool,
  feedbackTool,
  brainstormTool,
  namesTool,
  summarizeTool,
]

/** Custom tools (DESIGN.md §9): the writer's own prompt, with placeholders the app fills in. */
export interface CustomToolRow {
  id: string
  name: string | null
  prompt_template: string | null
  output_mode: string | null
}

export const CUSTOM_TOOLS_SQL =
  "SELECT id, name, prompt_template, output_mode FROM custom_tools ORDER BY name COLLATE NOCASE, id"

export const OUTPUT_MODES = [
  { value: "variants", label: "Two versions of some prose" },
  { value: "list", label: "A list of ideas" },
  { value: "long", label: "One long draft" },
] as const
export type OutputMode = (typeof OUTPUT_MODES)[number]["value"]
export const isOutputMode = (value: unknown): value is OutputMode => OUTPUT_MODES.some((mode) => mode.value === value)

export const PLACEHOLDERS = [
  { name: "selection", means: "the text you selected" },
  { name: "before", means: "the text before your cursor or selection" },
  { name: "after", means: "the text after it" },
  { name: "summary", means: "the chapter's summary" },
  { name: "moments", means: "the chapter's moments" },
  { name: "world", means: "World entries set to Always, and those the text mentions" },
  { name: "style", means: "the book's details and style guide" },
] as const

/** Old names from DESIGN.md: `{beats}` is `{moments}` and `{codex}` is `{world}`. */
export const PLACEHOLDER_ALIASES: Readonly<Record<string, string>> = { beats: "moments", codex: "world" }

export const usesSelection = (template: string) => /\{selection\}/i.test(template)

export function customTool(row: CustomToolRow): ToolDef {
  const template = row.prompt_template ?? ""
  const mode: OutputMode = isOutputMode(row.output_mode) ? row.output_mode : "variants"
  const selection = usesSelection(template)
  return {
    id: `custom:${row.id}`,
    name: row.name?.trim() || "Untitled tool",
    group: "Your tools",
    blurb: OUTPUT_MODES.find((option) => option.value === mode)!.label,
    input: selection ? "selection" : "caret",
    output: mode === "list" ? "ideas" : "prose",
    variants: mode === "variants" ? 2 : 1,
    fields: [],
    window: { before: 4_000, after: 1_200 },
    placement: mode === "list" ? null : selection ? "replace" : "insert",
    template,
    maxTokens: (_, text) =>
      mode === "long" ? 3000 : mode === "list" ? 1000 : selection ? selectionRoom(text, 2, 400, 4096) : 1000,
    instructions: () =>
      mode === "list"
        ? "Do what the author asks. Give your answer as a numbered list, with no other text."
        : "Do what the author asks. Reply with prose only, ready to go into the book.",
    task: () => template,
  }
}

export function toolById(id: string, custom: readonly ToolDef[]): ToolDef | undefined {
  return BUILTIN_TOOLS.find((tool) => tool.id === id) ?? custom.find((tool) => tool.id === id)
}

/** Each field's value: what the writer last chose, else its first value. */
export function fieldValues(tool: ToolDef, saved: Readonly<Record<string, string>> | undefined) {
  const values: Record<string, string> = {}
  for (const field of tool.fields) {
    const value = saved?.[field.key]
    if (field.kind === "choice") {
      values[field.key] = field.options.some((option) => option.value === value) ? value! : field.initial
    } else {
      values[field.key] = typeof value === "string" ? value : ""
    }
  }
  return values
}

/** Whether a field shows, given the others. */
export const fieldShown = (field: ToolField, values: FieldValues) =>
  field.kind !== "text" || !field.when || values[field.when.key] === field.when.value

/** The `ai.tool` pref: the tool the panel shows, and what was last chosen in each tool's fields, by tool id. */
export interface ToolPref {
  tool: string
  fields: Readonly<Record<string, FieldValues>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function parseToolPref(raw: string | null | undefined): ToolPref {
  const fallback: ToolPref = { tool: BUILTIN_TOOLS[0].id, fields: {} }
  if (!raw) return fallback
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (!isRecord(value)) return fallback
  const fields: Record<string, FieldValues> = {}
  if (isRecord(value.fields)) {
    for (const [toolId, values] of Object.entries(value.fields)) {
      if (!isRecord(values)) continue
      fields[toolId] = Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    }
  }
  return { tool: typeof value.tool === "string" && value.tool ? value.tool : fallback.tool, fields }
}
