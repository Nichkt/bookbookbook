import { entryMatches, type Codex, type CodexEntry } from "./codexData"

/*
 * The Codex screen's layout, list and navigation rules (DESIGN.md §7, §16), kept apart from its components.
 */

/** Three columns from here up: types, entries, the entry. */
export const WIDE_QUERY = "(min-width: 64rem)"
/** Two from here up: entries, with the types in a menu, beside the entry. Phones show one at a time. */
export const SPLIT_QUERY = "(min-width: 48rem)"

export type CodexLayout = "wide" | "split" | "phone"

/** The list of entries without a type, as `entriesByType` keys them. */
export const NO_TYPE = ""

const listKey = (bookId: string) => `bbb.codexType.${bookId}`
const lastEntryKey = (bookId: string) => `bbb.lastEntry.${bookId}`

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Only a convenience.
  }
}

/** The type whose entries the list showed last, per book and device. */
export const readList = (bookId: string) => read(listKey(bookId))
export const saveList = (bookId: string, list: string) => write(listKey(bookId), list)
/** The entry open last, per book and device. */
export const readLastEntry = (bookId: string) => read(lastEntryKey(bookId))
export const saveLastEntry = (bookId: string, entryId: string) => write(lastEntryKey(bookId), entryId)

/** The list to show: the type asked for if it's still there, else the first type. */
export function resolveList(codex: Pick<Codex, "types" | "typeById" | "entriesByType">, wanted: string | null): string {
  if (wanted !== null && (wanted === NO_TYPE ? codex.entriesByType.has(NO_TYPE) : codex.typeById.has(wanted))) {
    return wanted
  }
  return codex.types[0]?.id ?? NO_TYPE
}

export interface ListFilter {
  query: string
  /** Only entries with this tag, ignoring case. */
  tag: string | null
}

export const NO_FILTER: ListFilter = { query: "", tag: null }

export const isFiltering = (filter: ListFilter) => filter.query.trim() !== "" || filter.tag !== null

/** The entries the list shows: a search or tag looks through every type, else it's the chosen type's. */
export function listEntries(
  codex: Pick<Codex, "entries" | "entriesByType">,
  list: string,
  filter: ListFilter,
): readonly CodexEntry[] {
  if (!isFiltering(filter)) return codex.entriesByType.get(list) ?? []
  const tag = filter.tag?.toLowerCase()
  return codex.entries.filter(
    (entry) =>
      (tag === undefined || entry.tags.some((candidate) => candidate.toLowerCase() === tag)) &&
      entryMatches(entry, filter.query),
  )
}

/** What to show once `id` leaves the list: the entry after it, else the one before. */
export function neighborOf(list: readonly CodexEntry[], id: string): CodexEntry | null {
  const index = list.findIndex((entry) => entry.id === id)
  if (index === -1) return list[0] ?? null
  return list[index + 1] ?? list[index - 1] ?? null
}

/** Location state for `/world` that keeps an empty list on screen, instead of opening an entry on wide screens. */
export const STAY_STATE = { codexStay: true } as const

export const isStayState = (state: unknown) => typeof state === "object" && state !== null && "codexStay" in state

/** On phones, where an entry fills the screen: the way back to the list. */
export interface BackLink {
  to: string
  label: string
}

/** A type's name or singular for use mid-sentence: "Plot threads" → "plot threads", but "NPCs" stays. */
export const nounOf = (name: string) =>
  name.replace(/\p{L}+/gu, (word) => (word.length > 1 && /^\p{Lu}+s?$/u.test(word) ? word : word.toLowerCase()))

/** “Mara Quill”, or "the unnamed character". */
export const entryLabel = (entry: CodexEntry, singular: string | undefined) =>
  entry.named ? `“${entry.name}”` : `the unnamed ${nounOf(singular ?? "entry")}`

/** The toast after a type's field is removed, saying which entries kept their text. */
export function removedFieldMessage(label: string, typeName: string, kept: number): string {
  const removed = `Removed “${label}” from ${typeName}`
  return kept === 0 ? removed : `${removed}, except ${kept} that filled it in`
}

/** Why a type can't have this name: it's blank, or another type has it, ignoring case. Null if it can. */
export function typeNameError(
  name: string,
  types: readonly { id: string; name: string }[],
  editing: string | null,
): string | null {
  const wanted = name.trim()
  if (!wanted) return "Give the type a name."
  const lower = wanted.toLowerCase()
  const taken = types.find((type) => type.id !== editing && type.name.toLowerCase() === lower)
  return taken ? `There's a type called “${taken.name}” already.` : null
}
