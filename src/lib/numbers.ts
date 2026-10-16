/** Reads a positive whole number typed by the writer ("80,000" works too). Empty or invalid input reads as null. */
export function parseCount(text: string): number | null {
  const cleaned = text.replace(/[\s,_]/g, "")
  if (!cleaned) return null
  const value = Math.round(Number(cleaned))
  return Number.isFinite(value) && value > 0 ? value : null
}

export const formatCount = (value: number) => value.toLocaleString()
