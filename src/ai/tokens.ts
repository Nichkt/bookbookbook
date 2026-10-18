/*
 * Token counts are estimates: characters ÷ 4, which is close for English prose and errs on the generous side for most
 * models (DESIGN.md §9 "Context assembly"). They're shown with "~" so they aren't taken for exact.
 */

export const estimateTokens = (text: string) => Math.ceil(text.length / 4)

/** The characters that fit in so many tokens. */
export const charsForTokens = (tokens: number) => Math.max(0, Math.floor(tokens * 4))

/** "~850", "~1.2k", "~12k". */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `~${tokens}`
  if (tokens < 10_000) return `~${(Math.round(tokens / 100) / 10).toString()}k`
  return `~${Math.round(tokens / 1000)}k`
}

/** Room for an answer of about so many words: English runs about 1.3 tokens a word, and models overshoot. */
export const tokensForWords = (words: number) => Math.ceil(words * 1.6) + 64
