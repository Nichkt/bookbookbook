import { MIN_TERM_LENGTH } from "@/editor/mentions"

/*
 * Telling a name in text, for Add to World (addToWorld.ts) and for a note's first line in the Inbox. Kept apart
 * from the editor, so the Inbox's quick note doesn't load it.
 */

/** Longer selections aren't taken for a name. */
export const MAX_NAME_LENGTH = 60
const MAX_NAME_WORDS = 6

const OPENING = /^[\s"'“‘«([{]+/u
const CLOSING = /[\s"'”’»)\]}.,;:!?…—–-]+$/u
const POSSESSIVE = /(?<=\p{L})['’]s?$/u

/** Selected text as a name: on one line, without the quotes, punctuation or possessive around it ("Mara's," → "Mara"). */
export function tidyName(text: string): string {
  return text
    .replace(/\s+/gu, " ")
    .replace(OPENING, "")
    .replace(CLOSING, "")
    .replace(POSSESSIVE, "")
    .replace(CLOSING, "")
}

/** Whether tidied text could be a name: a few words, with a letter in, and no sentence punctuation. */
export function looksLikeName(name: string): boolean {
  if (name.length < MIN_TERM_LENGTH || name.length > MAX_NAME_LENGTH) return false
  if (!/\p{L}/u.test(name) || /[,;:!?…"“”«»()[\]{}]/u.test(name)) return false
  return name.split(" ").length <= MAX_NAME_WORDS
}

/** Written as names are: a word starts with a capital, or the script has no small letters. */
export const isCapitalized = (name: string) => /(?:^|\s)\p{Lu}/u.test(name) || !/\p{Ll}/u.test(name)
