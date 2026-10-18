import { useQuery } from "@powersync/react"
import { useMemo } from "react"
import { CODEX_TYPES, NO_AUTO_MENTION_TYPES, type CodexTypeKey } from "@/db/codexTypes"
import { MIN_TERM_LENGTH } from "@/editor/mentions"
import { parseStringList } from "@/lib/json"
import { colorFor } from "@/lib/palette"
import { richTextToPlain } from "@/lib/richText"

/*
 * The codex as its screen shows it (DESIGN.md §7): the types in the book's universe, the built-in ones first in their
 * usual order and then the writer's own, and the entries outside the Trash, parsed from their JSON columns.
 */

const KEYED = {
  rowComparator: {
    keyBy: (row: { id: string }) => row.id,
    compareBy: (row: unknown) => JSON.stringify(row),
  },
}

export type AiContext = "always" | "mentioned" | "never"

export const AI_CONTEXTS: readonly { value: AiContext; label: string; hint: string }[] = [
  { value: "always", label: "Always", hint: "AI tools will always know about it." },
  { value: "mentioned", label: "When mentioned", hint: "AI tools will know about it when the text mentions it." },
  { value: "never", label: "Never", hint: "AI tools will never see it." },
]

const SINGULAR: Record<CodexTypeKey, string> = {
  characters: "Character",
  locations: "Location",
  objects: "Object",
  factions: "Faction",
  lore: "Lore",
  events: "Event",
  plot_threads: "Story point",
  themes: "Theme",
}

export interface CodexType {
  id: string
  key: string
  name: string
  /** "Character" for Characters. */
  singular: string
  /** A lucide icon name. */
  icon: string
  /** The type's field labels, in order. */
  fields: string[]
  builtin: boolean
  /** Whether names of its entries are underlined in the text and counted in Appears in. */
  tracked: boolean
}

export interface CodexEntry {
  id: string
  typeId: string | null
  /** Trimmed; UNNAMED_ENTRY when blank. */
  name: string
  /** False when the stored name is blank. */
  named: boolean
  aliases: string[]
  tags: string[]
  /** Values by field label: the type's fields and any the entry adds. */
  fields: Record<string, string>
  notes: string
  aiContext: AiContext
  color: string
}

export interface Codex {
  types: CodexType[]
  typeById: ReadonlyMap<string, CodexType>
  /** By name. */
  entries: CodexEntry[]
  entryById: ReadonlyMap<string, CodexEntry>
  /** Entries by type id, by name; "" holds entries whose type is missing. */
  entriesByType: ReadonlyMap<string, CodexEntry[]>
  /** Every tag in use, sorted. */
  tags: string[]
}

export interface CodexTypeRow {
  id: string
  key: string | null
  name: string | null
  icon: string | null
  field_schema: string | null
  builtin: number | null
}

export const CODEX_TYPES_SQL = `
  SELECT t.id, t.key, t.name, t.icon, t.field_schema, t.builtin
  FROM codex_types t JOIN books b ON b.universe_id = t.universe_id
  WHERE b.id = ?`

export interface CodexEntryRow {
  id: string
  type_id: string | null
  name: string | null
  aliases: string | null
  tags: string | null
  fields: string | null
  notes: string | null
  ai_context: string | null
  color: string | null
}

export const CODEX_ENTRIES_SQL = `
  SELECT e.id, e.type_id, e.name, e.aliases, e.tags, e.fields, e.notes, e.ai_context, e.color
  FROM codex_entries e JOIN books b ON b.universe_id = e.universe_id
  WHERE b.id = ? AND e.deleted_at IS NULL`

export const UNNAMED_ENTRY = "Unnamed"
export const UNTITLED_TYPE = "Untitled type"

/** Plurals a type name might end in that the rules in `singularOf` would get wrong. */
const IRREGULAR = new Map([
  ["children", "child"],
  ["people", "person"],
  ["men", "man"],
  ["women", "woman"],
  ["mice", "mouse"],
  ["geese", "goose"],
  ["elves", "elf"],
  ["dwarves", "dwarf"],
  ["wolves", "wolf"],
  ["thieves", "thief"],
  ["knives", "knife"],
  ["lives", "life"],
  ["leaves", "leaf"],
  ["heroes", "hero"],
  ["zombies", "zombie"],
  ["pixies", "pixie"],
  ["movies", "movie"],
  ["species", "species"],
  ["series", "series"],
])

/** A singular for a type the writer named: "Ships" makes "Ship", "Cities" "City", "Witches" "Witch", "Elves" "Elf". */
export function singularOf(name: string): string {
  const match = /\p{L}+$/u.exec(name)
  if (!match) return name
  const word = match[0]
  const lower = word.toLowerCase()
  const irregular = IRREGULAR.get(lower)
  let singular: string
  if (irregular !== undefined) {
    if (word.length > 1 && word === word.toUpperCase()) singular = irregular.toUpperCase()
    else singular = word[0] === lower[0] ? irregular : irregular.charAt(0).toUpperCase() + irregular.slice(1)
  } else if (!lower.endsWith("s") || /(?:ss|us|is)$/.test(lower)) {
    return name
  } else if (/[^aeiou]ies$/.test(lower)) {
    singular = word.slice(0, -3) + (word.endsWith("IES") ? "Y" : "y")
  } else if (/(?:ss|sh|ch|x|z)es$/.test(lower)) {
    singular = word.slice(0, -2)
  } else {
    singular = word.slice(0, -1)
  }
  return name.slice(0, match.index) + singular
}

/** Field labels from a type's `field_schema`: `[{ "label": "Role", "kind": "text" }, …]`. */
export function parseFieldSchema(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const labels = value.map((field: unknown) =>
      typeof field === "object" && field !== null && "label" in field && typeof field.label === "string"
        ? field.label.trim()
        : "",
    )
    return [...new Set(labels.filter(Boolean))]
  } catch {
    return []
  }
}

/** An entry's `fields`: an object of strings by label. */
export function parseFields(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
    const fields: Record<string, string> = {}
    for (const [label, text] of Object.entries(value)) if (typeof text === "string") fields[label] = text
    return fields
  } catch {
    return {}
  }
}

const isAiContext = (value: unknown): value is AiContext => AI_CONTEXTS.some((option) => option.value === value)

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })

const BUILTIN_ORDER = new Map<string, number>(CODEX_TYPES.map((type, index) => [type.key, index]))
const BUILTIN_NAME = new Map<string, string>(CODEX_TYPES.map((type) => [type.key, type.name]))

const isBuiltinKey = (key: string | null | undefined): key is CodexTypeKey => !!key && BUILTIN_ORDER.has(key)

/** "Character" for the built-in Characters; a singular made from the name for the writer's own types. */
export function typeSingular(type: { key: string | null; name: string | null; builtin: number | boolean | null }) {
  if (type.builtin && isBuiltinKey(type.key)) return SINGULAR[type.key]
  return singularOf(type.name?.trim() || UNTITLED_TYPE)
}

export function buildCodex(typeRows: readonly CodexTypeRow[], entryRows: readonly CodexEntryRow[]): Codex {
  const types = typeRows.map((row): CodexType => {
    const key = row.key ?? ""
    const builtin = !!row.builtin && isBuiltinKey(key)
    // Built-in types can't be renamed, so they read as the app names them now ("Plot threads" became "Story points").
    const name = (builtin && BUILTIN_NAME.get(key)) || row.name?.trim() || UNTITLED_TYPE
    return {
      id: row.id,
      key,
      name,
      singular: typeSingular(row),
      icon: row.icon || "shapes",
      fields: parseFieldSchema(row.field_schema),
      builtin,
      tracked: !NO_AUTO_MENTION_TYPES.includes(key as CodexTypeKey),
    }
  })
  types.sort((a, b) => {
    const order = (type: CodexType) => (type.builtin ? BUILTIN_ORDER.get(type.key)! : BUILTIN_ORDER.size)
    return order(a) - order(b) || byName(a, b) || a.id.localeCompare(b.id)
  })
  const typeById = new Map(types.map((type) => [type.id, type]))

  const entries = entryRows.map((row): CodexEntry => {
    const stored = row.name?.trim() ?? ""
    const name = stored || UNNAMED_ENTRY
    return {
      id: row.id,
      typeId: row.type_id && typeById.has(row.type_id) ? row.type_id : null,
      name,
      named: stored !== "",
      aliases: parseStringList(row.aliases),
      tags: parseStringList(row.tags),
      fields: parseFields(row.fields),
      notes: richTextToPlain(row.notes),
      aiContext: isAiContext(row.ai_context) ? row.ai_context : "mentioned",
      color: row.color || colorFor(name),
    }
  })
  entries.sort((a, b) => byName(a, b) || a.id.localeCompare(b.id))

  const entriesByType = new Map<string, CodexEntry[]>()
  for (const entry of entries) {
    const key = entry.typeId ?? ""
    const list = entriesByType.get(key)
    if (list) list.push(entry)
    else entriesByType.set(key, [entry])
  }
  const tags = new Map<string, string>()
  for (const entry of entries) for (const tag of entry.tags) if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag)

  return {
    types,
    typeById,
    entries,
    entryById: new Map(entries.map((entry) => [entry.id, entry])),
    entriesByType,
    tags: [...tags.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  }
}

export function useCodex(bookId: string): Codex & { isLoading: boolean } {
  const types = useQuery<CodexTypeRow>(CODEX_TYPES_SQL, [bookId], KEYED)
  const entries = useQuery<CodexEntryRow>(CODEX_ENTRIES_SQL, [bookId], KEYED)
  const codex = useMemo(() => buildCodex(types.data, entries.data), [types.data, entries.data])
  return useMemo(
    () => ({ ...codex, isLoading: types.isLoading || entries.isLoading }),
    [codex, types.isLoading, entries.isLoading],
  )
}

/** The field labels an entry shows: its type's, then any it adds. */
export function entryFieldLabels(entry: CodexEntry, type: CodexType | undefined): string[] {
  const own = type?.fields ?? []
  const lower = new Set(own.map((label) => label.toLowerCase()))
  return [...own, ...Object.keys(entry.fields).filter((label) => !lower.has(label.toLowerCase()))]
}

/** The entry's text for a field, matching the label's case loosely, as entryFieldLabels does. */
export function fieldValue(entry: CodexEntry, label: string): string {
  if (Object.hasOwn(entry.fields, label)) return entry.fields[label] ?? ""
  const lower = label.toLowerCase()
  for (const [key, value] of Object.entries(entry.fields)) if (key.toLowerCase() === lower) return value
  return ""
}

/** `/b/:bookId/world/:entryId?`: the World screen, which the code calls the codex. */
export const codexPath = (bookId: string, entryId?: string | null) =>
  `/b/${bookId}/world${entryId ? `/${entryId}` : ""}`

/** Whether the text underlines the entry (see NO_AUTO_MENTION_TYPES). Entries without a type are underlined. */
export const isTracked = (codex: Pick<Codex, "typeById">, entry: CodexEntry) =>
  entry.typeId === null || codex.typeById.get(entry.typeId)?.tracked !== false

/** The names the text finds an entry by: its name and aliases, as the mention matcher takes them. */
export function entryTerms(entry: CodexEntry): string[] {
  const terms = (entry.named ? [entry.name, ...entry.aliases] : entry.aliases).map((term) => term.trim())
  return [...new Set(terms.filter((term) => term.length >= MIN_TERM_LENGTH))]
}

export interface SharedTerm {
  term: string
  others: CodexEntry[]
}

/** The entry's names that another underlined entry also has, so the text underlines neither (DESIGN.md §7). */
export function sharedTerms(codex: Pick<Codex, "entries" | "typeById">, entry: CodexEntry): SharedTerm[] {
  if (!isTracked(codex, entry)) return []
  const mine = entryTerms(entry)
  const wanted = new Set(mine)
  const owners = new Map<string, CodexEntry[]>()
  for (const other of codex.entries) {
    if (other.id === entry.id || !isTracked(codex, other)) continue
    for (const term of entryTerms(other)) {
      if (!wanted.has(term)) continue
      const list = owners.get(term)
      if (list) list.push(other)
      else owners.set(term, [other])
    }
  }
  return mine.flatMap((term) => {
    const others = owners.get(term)
    return others ? [{ term, others }] : []
  })
}

/** Whether the entry matches a search: its name, aliases, tags, fields and notes, ignoring case. */
export function entryMatches(entry: CodexEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [entry.name, ...entry.aliases, ...entry.tags, ...Object.values(entry.fields), entry.notes].some((text) =>
    text.toLowerCase().includes(needle),
  )
}

const firstLetter = (word: string | undefined) => (word ? (Array.from(word)[0] ?? "").toUpperCase() : "")

/** "MQ" for Mara Quill, "S" for Salt. */
export function initials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? []
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words.at(-1)) : "") || "?"
}
