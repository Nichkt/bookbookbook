/*
 * Notes typed in a composer and not yet added, kept while it's closed, so closing Quick note, or leaving the Inbox,
 * never loses one. For this visit only: a reload starts afresh.
 */

export interface Draft {
  text: string
  /** The engine that heard any of it, for a note partly dictated. */
  heardBy: string | null
}

const EMPTY: Draft = { text: "", heardBy: null }

/** By book and composer. */
const drafts = new Map<string, Draft>()

const draftKey = (bookId: string, composer: string) => `${bookId}\n${composer}`

export const readDraft = (bookId: string, composer: string): Draft => drafts.get(draftKey(bookId, composer)) ?? EMPTY

export function keepDraft(bookId: string, composer: string, draft: Draft) {
  const key = draftKey(bookId, composer)
  if (draft.text.trim()) drafts.set(key, draft)
  else drafts.delete(key)
}
