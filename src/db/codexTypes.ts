import { newId } from "@/lib/id"
import { insertRow, type Tx } from "./tx"

const CHARACTER_FIELDS = ["Role", "Age", "Appearance", "Personality", "Goal", "Wound / fear", "Voice & speech", "Arc"]

/**
 * The built-in World types (DESIGN.md §7; the code calls the World the codex). Every new universe gets them; users add
 * fields and custom types later. Their names show from here, not from the database, so a rename reaches every book.
 */
export const CODEX_TYPES = [
  { key: "characters", name: "Characters", icon: "user-round", fields: CHARACTER_FIELDS },
  { key: "locations", name: "Locations", icon: "map-pin", fields: ["Atmosphere", "Senses", "History"] },
  { key: "objects", name: "Objects", icon: "key-round", fields: ["Description", "Owner", "Secret"] },
  { key: "factions", name: "Factions", icon: "shield", fields: ["Power", "Public face", "Secret"] },
  { key: "lore", name: "Lore / Magic / Tech", icon: "sparkles", fields: ["Meaning", "Rules", "Symbol"] },
  { key: "events", name: "Events", icon: "calendar", fields: ["When", "Where", "Consequences"] },
  { key: "plot_threads", name: "Story points", icon: "spline", fields: ["Question", "Stakes", "Resolution"] },
  { key: "themes", name: "Themes", icon: "feather", fields: ["Statement", "Motifs"] },
] as const

export type CodexTypeKey = (typeof CODEX_TYPES)[number]["key"]

/**
 * Types whose names are ordinary words ("The Storm", "Grief"), so prose mentions of them aren't tracked: only
 * characters, places, objects, factions and lore get underlined.
 */
export const NO_AUTO_MENTION_TYPES: readonly CodexTypeKey[] = ["events", "plot_threads", "themes"]

/** Creates one built-in type in a universe. Returns its id. */
export async function insertCodexType(tx: Tx, universeId: string, key: CodexTypeKey): Promise<string> {
  const type = CODEX_TYPES.find((candidate) => candidate.key === key)!
  const id = newId()
  await insertRow(tx, "codex_types", {
    id,
    universe_id: universeId,
    key: type.key,
    name: type.name,
    icon: type.icon,
    field_schema: JSON.stringify(type.fields.map((label) => ({ label, kind: "text" }))),
    builtin: 1,
  })
  return id
}

/** Creates the built-in types in a universe. Returns their ids by key. */
export async function insertBuiltinCodexTypes(tx: Tx, universeId: string): Promise<Map<CodexTypeKey, string>> {
  const ids = new Map<CodexTypeKey, string>()
  for (const type of CODEX_TYPES) ids.set(type.key, await insertCodexType(tx, universeId, type.key))
  return ids
}
