import { useQuery } from "@powersync/react"
import { useMemo } from "react"
import { MENTION_ENTRIES_SQL, type MentionRow } from "@/db/queries"
import { buildMentionMatcher, parseAliases, type MentionMatcher } from "./mentions"

// Differential watching keeps `data` (and so the matcher) stable until an entry's name or aliases change.
const COMPARATOR = {
  keyBy: (row: MentionRow) => row.id,
  compareBy: (row: MentionRow) => `${row.name}\u0000${row.aliases}`,
}

/** One matcher over every codex entry in the book's universe. */
export function useMentionMatcher(bookId: string | undefined): MentionMatcher {
  const { data } = useQuery<MentionRow>(MENTION_ENTRIES_SQL, [bookId ?? ""], { rowComparator: COMPARATOR })
  return useMemo(
    () => buildMentionMatcher(data.map((row) => ({ id: row.id, name: row.name ?? "", aliases: parseAliases(row.aliases) }))),
    [data],
  )
}
