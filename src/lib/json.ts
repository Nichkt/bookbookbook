/** Reads a JSON array of strings, as stored in `labels`, `aliases` and `tags`. Anything else reads as empty. */
export function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

/** Trims, drops empties and case-insensitive duplicates, keeping the first spelling. */
export function uniqueStrings(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const trimmed = item.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}
