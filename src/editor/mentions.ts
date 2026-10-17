export interface MentionTarget {
  id: string
  name: string
  aliases: readonly string[]
}

export interface MentionMatch {
  from: number
  to: number
  entryId: string
}

export interface MentionMatcher {
  /** Mentions in `text`, in order and never overlapping. */
  find(text: string): MentionMatch[]
}

export const EMPTY_MATCHER: MentionMatcher = { find: () => [] }

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Shorter names and aliases are never matched: a single letter would underline every "A". */
export const MIN_TERM_LENGTH = 2

/**
 * Auto-mention rules from DESIGN.md §7: whole words, case-sensitive, longest match wins ("Jonas Quill" over
 * "Jonas"), and a term shared by two entries is never linked. Possessives work because "'" isn't a word character.
 * M3 moves this into a worker with per-alias options; the rules stay the same.
 */
export function buildMentionMatcher(entries: readonly MentionTarget[]): MentionMatcher {
  const owners = new Map<string, Set<string>>()
  for (const entry of entries) {
    for (const raw of [entry.name, ...entry.aliases]) {
      const term = raw.trim()
      if (term.length < MIN_TERM_LENGTH) continue
      let ids = owners.get(term)
      if (!ids) owners.set(term, (ids = new Set()))
      ids.add(entry.id)
    }
  }
  const entryByTerm = new Map<string, string>()
  for (const [term, ids] of owners) if (ids.size === 1) entryByTerm.set(term, [...ids][0])
  if (entryByTerm.size === 0) return EMPTY_MATCHER

  // Alternation takes the first alternative that fits, so longer terms go first.
  const terms = [...entryByTerm.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${terms.join("|")})(?![\\p{L}\\p{M}\\p{N}_])`, "gu")
  return {
    find(text) {
      const matches: MentionMatch[] = []
      for (const match of text.matchAll(pattern)) {
        matches.push({ from: match.index, to: match.index + match[0].length, entryId: entryByTerm.get(match[0])! })
      }
      return matches
    },
  }
}

/** Codex `aliases` are stored as a JSON array of strings. */
export function parseAliases(json: string | null): string[] {
  if (!json) return []
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}
