/**
 * Words the way writers count them: whitespace-separated runs that contain a letter or digit, so a spaced em dash
 * or a lone "*" isn't a word.
 */
export function countWords(text: string): number {
  let words = 0
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) words++
  return words
}
