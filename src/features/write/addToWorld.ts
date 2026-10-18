import { TextSelection, type EditorState } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"
import { create } from "zustand"
import { useEditors } from "@/editor/activeEditor"
import { MIN_TERM_LENGTH, type MentionMatcher } from "@/editor/mentions"
import { entryTerms, type CodexEntry, type CodexType } from "@/features/codex/codexData"
import { uniqueStrings } from "@/lib/json"

/*
 * Add to World (DESIGN.md §7 "Quick-create"): a name selected in the text becomes a World entry without leaving the
 * page. A bubble over the selection and the ⋯ menus open the dialog (AddToWorldDialog.tsx).
 */

/** Per device: the type the dialog used last, which it offers first next time. */
export const WORLD_TYPE_PREF = "write.worldType"

/** Longer selections aren't taken for a name. */
export const MAX_NAME_LENGTH = 60
const MAX_NAME_WORDS = 6

/** Where focus goes when the dialog closes. */
type AfterClose =
  /** Back to the text, with the name still selected. */
  | "text"
  /** To the text, with the selection the name came from collapsed to its end. */
  | "caret"

interface AddToWorldState {
  open: boolean
  /** Bumped each time the dialog opens, so its form starts afresh. */
  session: number
  /** What the name field starts with: the selected name, or nothing. */
  name: string
  /** What the notes start with, as an idea from the AI tools gives them. */
  notes: string
  /** The key of the type to offer first, as "locations" for a place the AI tools thought up. */
  typeKey: string | null
  /** The editor the selection was in, and where, to go back to once the dialog closes. */
  editor: Editor | null
  range: { from: number; to: number } | null
  /** Where focus goes without an editor to go back to: the control that opened the dialog. */
  returnFocus: HTMLElement | null
  after: AfterClose
  /** What to do once focus is back, like open the World page, which on a phone takes focus in turn. */
  then: (() => void) | null
}

export const useAddToWorld = create<AddToWorldState>(() => ({
  open: false,
  session: 0,
  name: "",
  notes: "",
  typeKey: null,
  editor: null,
  range: null,
  returnFocus: null,
  after: "text",
  then: null,
}))

/** Opens the dialog with the name selected in `editor`, if there is one. */
export function openAddToWorld(editor: Editor | null, returnFocus: HTMLElement | null = null) {
  const live = editor && !editor.isDestroyed ? editor : null
  const selection = live?.state.selection
  useAddToWorld.setState((state) => ({
    open: true,
    session: state.session + 1,
    name: live ? selectedName(live.state) : "",
    notes: "",
    typeKey: null,
    editor: live,
    range: selection ? { from: selection.from, to: selection.to } : null,
    returnFocus,
    after: "text",
    then: null,
  }))
}

export interface NamedIdea {
  name: string
  notes: string
  /** The key of the type to offer first. */
  typeKey: string | null
}

/** Opens the dialog filled in with something that has a name, like an idea from the AI tools. */
export function openAddToWorldWith(idea: NamedIdea, returnFocus: HTMLElement | null) {
  useAddToWorld.setState((state) => ({
    open: true,
    session: state.session + 1,
    name: idea.name,
    notes: idea.notes,
    typeKey: idea.typeKey,
    editor: null,
    range: null,
    returnFocus,
    after: "text",
    then: null,
  }))
}

export const closeAddToWorld = (after: AfterClose = "text", then: (() => void) | null = null) =>
  useAddToWorld.setState({ open: false, after, then })

/** From a ⋯ menu: with the name selected in the text the writer was last in, if any. */
export const addToWorldFromMenu = (returnFocus: HTMLElement | null) =>
  openAddToWorld(useEditors.getState().focused?.editor ?? null, returnFocus)

/** Puts focus back once the dialog has closed, then runs `then`. Returns false when there's nowhere to put focus. */
export function returnFromAddToWorld(): boolean {
  const { editor, range, returnFocus, after, then } = useAddToWorld.getState()
  useAddToWorld.setState({ then: null })
  let returned = false
  if (editor && !editor.isDestroyed) {
    if (range) editor.chain().setTextSelection(after === "caret" ? range.to : range).scrollIntoView().run()
    // At once, not a frame later as the focus command does, so focus is back before `then` moves it on.
    editor.view.focus()
    returned = true
  } else if (returnFocus?.isConnected) {
    returnFocus.focus()
    returned = true
  }
  then?.()
  return returned
}

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

/** The name selected in `state`, tidied: text within one paragraph that looks like a name. Else "". */
export function selectedName(state: EditorState): string {
  const { selection } = state
  if (selection.empty || !(selection instanceof TextSelection) || !selection.$from.sameParent(selection.$to)) return ""
  const name = tidyName(state.doc.textBetween(selection.from, selection.to, " ", " "))
  return looksLikeName(name) ? name : ""
}

/** Written as names are: a word starts with a capital, or the script has no small letters. */
export const isCapitalized = (name: string) => /(?:^|\s)\p{Lu}/u.test(name) || !/\p{Ll}/u.test(name)

// Words that start sentences far more often than they name anything. Not "will" or "may", which are names too.
const COMMON_WORDS = new Set(
  (
    "about after again all also an and another any as at back be because before both but by can could did do down " +
    "each even every for from had has have he her here hers him his how if in into is it its just let like many me " +
    "more most much must my never next no none nor not now of off on once one only or other our out over perhaps " +
    "she should since so some still such than that the their them then there these they this those though through " +
    "thus to too under until up upon us very was we well were what when where whether which while who whom whose " +
    "why with within without would yes yet you your"
  ).split(" "),
)

/** Whether the bubble offers to add `name`: written as a name, not a word that opens sentences, and not one already. */
export function offersToAdd(matcher: MentionMatcher, name: string): boolean {
  if (name === "" || !isCapitalized(name)) return false
  if (!name.includes(" ") && COMMON_WORDS.has(name.toLowerCase())) return false
  return !namesAnEntry(matcher, name)
}

/** Whether the text already underlines all of `name` as one entry's. */
export function namesAnEntry(matcher: MentionMatcher, name: string): boolean {
  const matches = matcher.find(name)
  return matches.length === 1 && matches[0].from === 0 && matches[0].to === name.length
}

/** The entry already called `name`, by its name or an alias, whatever the case. */
export function entryNamed<T extends Pick<CodexEntry, "name" | "named" | "aliases">>(
  entries: readonly T[],
  name: string,
): T | undefined {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return undefined
  return entries.find((entry) => entryTerms(entry).some((term) => term.toLowerCase() === wanted))
}

const LINKING_WORDS = new Set(["a", "an", "and", "da", "de", "del", "der", "di", "du", "la", "le", "of", "the", "van", "von"])

/** Shorter names the text might use: "Jonas" and "Quill" for "Jonas Quill". Not "the", "of" or "Dr.". */
export function aliasSuggestions(name: string): string[] {
  const words = name.trim().split(/\s+/u)
  if (words.length < 2) return []
  return uniqueStrings(
    words.filter(
      (word) =>
        word.length >= MIN_TERM_LENGTH &&
        !word.endsWith(".") &&
        isCapitalized(word) &&
        !LINKING_WORDS.has(word.toLowerCase()),
    ),
  )
}

/** The type the dialog offers first: the one asked for, else the one used last, else Characters, else the first. */
export function defaultTypeId(
  types: readonly Pick<CodexType, "id" | "key">[],
  lastUsed: string | null | undefined,
  preferredKey: string | null = null,
): string | null {
  const preferred = preferredKey ? types.find((type) => type.key === preferredKey) : undefined
  if (preferred) return preferred.id
  if (lastUsed && types.some((type) => type.id === lastUsed)) return lastUsed
  return (types.find((type) => type.key === "characters") ?? types[0])?.id ?? null
}
