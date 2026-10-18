import type { BookListRow } from "@/db/queries"
import { buildMentionMatcher } from "@/editor/mentions"
import { AUDIENCE_OPTIONS, passagesText, POV_OPTIONS, stylePrompt, TENSE_OPTIONS } from "@/features/books/bookStyle"
import {
  entryFieldLabels,
  entryTerms,
  fieldValue,
  isTracked,
  type Codex,
  type CodexEntry,
} from "@/features/codex/codexData"
import type { PlanChapter } from "@/features/plan/planData"
import type { BookFacts, ChapterFacts, CharacterVoice, StoryChapter, WorldItem } from "./context"
import type { FieldValues, ToolText } from "./tools"

/*
 * What the AI tools are told about the book (DESIGN.md §9 "Context assembly"): its settings, its plan and its World.
 * An entry set to Never is left out of all of it, its name included. Pure, so tests can pin it down; gather.ts reads
 * the writer's text and puts a request together.
 */

/** The story so far takes the summaries of this many earlier chapters at most, the nearest ones. */
export const STORY_CHAPTERS = 30
/** World entries the text mentions or the chapter links, at most. */
export const MENTIONED_ENTRIES = 40
export const MAX_VOICES = 8
export const MAX_NAMES = 60
/** The Characters type's field a character's voice is in. */
export const VOICE_FIELD = "Voice & speech"

type CodexLookup = Pick<Codex, "typeById" | "entryById">

export function bookFacts(book: BookListRow): BookFacts {
  return {
    title: book.title?.trim() ?? "",
    genre: book.genre?.trim() ?? "",
    audience: stylePrompt(AUDIENCE_OPTIONS, book.audience),
    pov: stylePrompt(POV_OPTIONS, book.pov),
    tense: stylePrompt(TENSE_OPTIONS, book.tense),
    premise: book.premise?.trim() ?? "",
    synopsis: book.synopsis?.trim() ?? "",
    styleGuide: book.style_guide?.trim() ?? "",
    samples: passagesText(book.sample_passages),
  }
}

/** "Chapter 3: The Ferry Home", or "Chapter 3" when it has no title. */
export function chapterLabel(chapter: Pick<PlanChapter, "number" | "title">): string {
  const title = chapter.title?.trim()
  return title ? `Chapter ${chapter.number}: ${title}` : `Chapter ${chapter.number}`
}

const sendable = (entry: CodexEntry | undefined): entry is CodexEntry => !!entry && entry.aiContext !== "never"

function nameOf(codex: CodexLookup, id: string | null | undefined): string | undefined {
  const entry = id ? codex.entryById.get(id) : undefined
  return sendable(entry) && entry.named ? entry.name : undefined
}

export function chapterFacts(chapter: PlanChapter, codex: CodexLookup): ChapterFacts {
  const moments = chapter.beats
    .map((beat) => ({ text: beat.text?.trim() ?? "", done: !!beat.done }))
    .filter((moment) => moment.text !== "")
  const present = chapter.present.flatMap((id) => nameOf(codex, id) ?? [])
  const pov = nameOf(codex, chapter.pov_entry_id)
  const location = nameOf(codex, chapter.location_entry_id)
  return {
    label: chapterLabel(chapter),
    summary: chapter.summary?.trim() ?? "",
    moments,
    next: moments.find((moment) => !moment.done)?.text ?? null,
    ...(pov ? { pov } : {}),
    ...(present.length > 0 ? { present } : {}),
    ...(location ? { location } : {}),
  }
}

/** The summaries of the chapters before this one, in reading order: the nearest STORY_CHAPTERS that have one. */
export function storySoFar(chapters: readonly PlanChapter[], chapterId: string): StoryChapter[] {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index <= 0) return []
  return chapters
    .slice(0, index)
    .flatMap((chapter) => {
      const summary = chapter.summary?.trim()
      return summary ? [{ label: chapterLabel(chapter), summary }] : []
    })
    .slice(-STORY_CHAPTERS)
}

export function worldItem(codex: Pick<Codex, "typeById">, entry: CodexEntry): WorldItem {
  const type = entry.typeId ? codex.typeById.get(entry.typeId) : undefined
  return {
    id: entry.id,
    name: entry.name,
    type: type?.singular ?? "",
    aliases: entry.aliases,
    fields: entryFieldLabels(entry, type)
      .map((label) => [label, fieldValue(entry, label).trim()] as const)
      .filter(([, value]) => value !== ""),
    notes: entry.notes.trim(),
  }
}

/** How often the texts name each entry, as the editor finds names: whole words, matching case. */
function mentionCounts(entries: readonly CodexEntry[], texts: readonly string[]): Map<string, number> {
  const matcher = buildMentionMatcher(entries.map((entry) => ({ id: entry.id, name: "", aliases: entryTerms(entry) })))
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const match of matcher.find(text)) counts.set(match.entryId, (counts.get(match.entryId) ?? 0) + 1)
  }
  return counts
}

/** Where a request's words could name World entries: the text it sends, the tool's fields, and the chapter's plan. */
export function textsToMatch(text: ToolText, fields: FieldValues, chapter: ChapterFacts | null): string[] {
  return [
    text.before,
    text.selection,
    text.after,
    text.chapter,
    ...Object.values(fields),
    chapter?.summary ?? "",
    ...(chapter?.moments.map((moment) => moment.text) ?? []),
  ].filter((part) => part.trim() !== "")
}

/** The entries the chapter's plan links: its point of view, location, who's present and its story points. */
export const linkedEntries = (chapter: PlanChapter | null): string[] =>
  chapter
    ? [chapter.pov_entry_id, chapter.location_entry_id, ...chapter.present, ...chapter.threads].filter(
        (id): id is string => !!id,
      )
    : []

export interface WorldContext {
  always: WorldItem[]
  /** Linked first, then the most mentioned. */
  mentioned: WorldItem[]
}

/**
 * The World entries set to Always, and those set to When mentioned that the texts name or the chapter's plan links:
 * the linked ones first, then the most mentioned, MENTIONED_ENTRIES at most.
 */
export function worldFor(codex: Codex, texts: readonly string[], linked: readonly string[]): WorldContext {
  const candidates = codex.entries.filter((entry) => entry.aiContext === "mentioned")
  const counts = mentionCounts(candidates, texts)
  const links = new Set(linked)
  const mentioned = candidates
    .filter((entry) => links.has(entry.id) || counts.has(entry.id))
    .sort(
      (a, b) =>
        Number(links.has(b.id)) - Number(links.has(a.id)) || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
    )
    .slice(0, MENTIONED_ENTRIES)
  return {
    always: codex.entries.filter((entry) => entry.aiContext === "always").map((entry) => worldItem(codex, entry)),
    mentioned: mentioned.map((entry) => worldItem(codex, entry)),
  }
}

const isCharacter = (codex: Pick<Codex, "typeById">, entry: CodexEntry) =>
  entry.typeId !== null && codex.typeById.get(entry.typeId)?.key === "characters"

/**
 * The voices of the characters the selection names, then of the chapter's point of view and who's present: those
 * whose "Voice & speech" is filled in, MAX_VOICES at most.
 */
export function voicesFor(codex: Codex, selection: string, chapter: PlanChapter | null): CharacterVoice[] {
  const characters = codex.entries.filter((entry) => sendable(entry) && isCharacter(codex, entry))
  const named = [...mentionCounts(characters, [selection]).keys()]
  const ids = new Set([...named, ...(chapter ? [chapter.pov_entry_id, ...chapter.present] : [])])
  const voices: CharacterVoice[] = []
  for (const id of ids) {
    const entry = id ? codex.entryById.get(id) : undefined
    if (!sendable(entry) || !isCharacter(codex, entry)) continue
    const voice = fieldValue(entry, VOICE_FIELD).trim()
    if (voice) voices.push({ name: entry.name, voice })
  }
  return voices.slice(0, MAX_VOICES)
}

/** The names in the World for the name generator to steer clear of: characters first, then places and things. */
export function namesToAvoid(codex: Codex): string[] {
  const named = codex.entries.filter((entry) => sendable(entry) && entry.named && isTracked(codex, entry))
  const characters = named.filter((entry) => isCharacter(codex, entry))
  const others = named.filter((entry) => !isCharacter(codex, entry))
  return [...characters, ...others].map((entry) => entry.name).slice(0, MAX_NAMES)
}
