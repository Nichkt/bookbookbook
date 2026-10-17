/** The locale's digit-group separator: "," in English, "." in German, a narrow space in French. */
function groupSeparator(locale?: string) {
  return new Intl.NumberFormat(locale).formatToParts(10_000).find((part) => part.type === "group")?.value ?? ""
}

/**
 * Reads a positive whole number typed by the writer. "80,000" works, and so does the locale's own grouping ("80.000"
 * in German), so whatever formatCount shows reads back. Empty or invalid input reads as null.
 */
export function parseCount(text: string, locale?: string): number | null {
  const group = groupSeparator(locale)
  const cleaned = (group ? text.replaceAll(group, "") : text).replace(/[\s,_]/g, "")
  if (!cleaned) return null
  const value = Math.round(Number(cleaned))
  return Number.isFinite(value) && value > 0 ? value : null
}

export const formatCount = (value: number, locale?: string) => value.toLocaleString(locale)

/** The text as formatCount shows it, when it reads as a count; anything else as it is. */
export function tidyCount(text: string, locale?: string) {
  const value = parseCount(text, locale)
  return value === null ? text : formatCount(value, locale)
}
