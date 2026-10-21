import { generateNKeysBetween } from "fractional-indexing"
import { ChangeSet } from "@/db/changes"
import { sortByPosition } from "@/db/order"
import type { ActRow, ChapterRow } from "@/db/schema"
import { insertRow, updateRow, type Db } from "@/db/tx"
import { insertCodexEntry } from "@/features/codex/mutations"
import { newId } from "@/lib/id"
import { nextColor } from "@/lib/palette"
import { DEFAULT_CHAPTER_TARGET, newChapterRow } from "./mutations"
import { shareOfTarget } from "./structures"

/*
 * Planning step by step (DESIGN.md §6), after the Snowflake method: the story in a sentence, then in five (how it
 * begins, three disasters, how it ends), then its main characters, then a chapter list grown from the five
 * sentences. Applying it saves the book's premise and synopsis, adds the characters to the World and the chapters
 * to the Plan, in one step that Undo takes back.
 */

export const WIZARD_STEPS = [
  "Your story in a sentence",
  "Your story in five sentences",
  "Your main characters",
  "Your chapters",
] as const

export interface WizardPart {
  /** The chapter it suggests is titled this. */
  title: string
  question: string
  /** Index into WIZARD_ACT_TITLES. */
  act: number
}

export const WIZARD_PARTS: readonly WizardPart[] = [
  {
    title: "Beginning",
    question: "How does it begin? Who is it about, and what is their life like before it all starts?",
    act: 0,
  },
  { title: "First disaster", question: "What goes wrong, and pulls them into the story?", act: 0 },
  { title: "Second disaster", question: "Halfway through, what makes things worse, or changes everything?", act: 1 },
  { title: "Third disaster", question: "What is the worst moment, when all seems lost?", act: 1 },
  { title: "Ending", question: "How does it all come to a head, and where does it leave them?", act: 2 },
]

export const WIZARD_ACT_TITLES = ["Act I — Setup", "Act II — Confrontation", "Act III — Resolution"] as const

export interface WizardCharacter {
  id: string
  name: string
  role: string
  goal: string
}

export interface WizardChapter {
  id: string
  title: string
  summary: string
}

export interface WizardAct {
  id: string
  title: string
  chapters: WizardChapter[]
}

export interface WizardDraft {
  step: number
  premise: string
  /** A sentence per WIZARD_PARTS entry. */
  parts: string[]
  characters: WizardCharacter[]
  /** The chapter list once the writer has changed it. Until then it follows the five sentences. */
  acts: WizardAct[] | null
  /** Whether to add the chapters, when the book has some already. */
  addChapters: boolean
}

export const blankCharacter = (): WizardCharacter => ({ id: newId(), name: "", role: "", goal: "" })
export const blankChapter = (): WizardChapter => ({ id: newId(), title: "", summary: "" })

export function newWizardDraft(premise = ""): WizardDraft {
  return {
    step: 0,
    premise,
    parts: WIZARD_PARTS.map(() => ""),
    characters: [blankCharacter()],
    acts: null,
    addChapters: true,
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "")
const records = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : []

/** A draft saved earlier, or null when there's none or it can't be read. */
export function parseWizardDraft(source: string | null | undefined): WizardDraft | null {
  if (!source) return null
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const parts = WIZARD_PARTS.map((_, index) => str(Array.isArray(raw.parts) ? raw.parts[index] : ""))
  const characters = records(raw.characters).map((item) => ({
    id: str(item.id) || newId(),
    name: str(item.name),
    role: str(item.role),
    goal: str(item.goal),
  }))
  const acts = Array.isArray(raw.acts)
    ? records(raw.acts).map((act) => ({
        id: str(act.id) || newId(),
        title: str(act.title),
        chapters: records(act.chapters).map((item) => ({
          id: str(item.id) || newId(),
          title: str(item.title),
          summary: str(item.summary),
        })),
      }))
    : null
  const step = typeof raw.step === "number" && Number.isInteger(raw.step) ? raw.step : 0
  return {
    step: Math.min(WIZARD_STEPS.length - 1, Math.max(0, step)),
    premise: str(raw.premise),
    parts,
    characters: characters.length > 0 ? characters : [blankCharacter()],
    acts,
    addChapters: raw.addChapters !== false,
  }
}

const tidy = (text: string) => text.trim().replace(/\s+/g, " ")

/** The five sentences as one paragraph, each given a full stop if it ends without one. */
export function joinSynopsis(parts: readonly string[]): string {
  return parts
    .map(tidy)
    .filter(Boolean)
    .map((part) => (/[.!?…"'”’)\]]$/.test(part) ? part : `${part}.`))
    .join(" ")
}

/**
 * The chapter list the five sentences suggest: a chapter for each sentence, in its act, summed up by it. The ids
 * are fixed, so the list keeps them once the writer starts changing it.
 */
export function seedWizardActs(parts: readonly string[]): WizardAct[] {
  const acts: WizardAct[] = WIZARD_ACT_TITLES.map((title, index) => ({ id: `act-${index}`, title, chapters: [] }))
  WIZARD_PARTS.forEach((part, index) => {
    const sentence = tidy(parts[index] ?? "")
    if (sentence) acts[part.act].chapters.push({ id: `part-${index}`, title: part.title, summary: sentence })
  })
  return acts
}

/** The chapter list as it stands: the writer's, else the one the five sentences suggest. */
export const wizardActs = (draft: WizardDraft) => draft.acts ?? seedWizardActs(draft.parts)

/** What applying the draft saves. */
export interface WizardPlan {
  premise: string
  synopsis: string
  characters: { name: string; role: string; goal: string }[]
  acts: { title: string; chapters: { title: string; summary: string }[] }[]
}

export function wizardPlan(draft: WizardDraft): WizardPlan {
  return {
    premise: tidy(draft.premise),
    synopsis: joinSynopsis(draft.parts),
    characters: draft.characters
      .filter((character) => character.name.trim())
      .map(({ name, role, goal }) => ({ name: tidy(name), role: tidy(role), goal: tidy(goal) })),
    acts: draft.addChapters
      ? wizardActs(draft).map((act) => ({
          title: tidy(act.title),
          chapters: act.chapters.map(({ title, summary }) => ({ title: tidy(title), summary: summary.trim() })),
        }))
      : [],
  }
}

/**
 * The book's one chapter, when nothing has been planned or written in it yet (as in a new book), so the wizard's
 * chapters take its place. An empty implicit scene, from opening it to write, doesn't count.
 */
export const BLANK_CHAPTER_SQL = `
  SELECT c.id FROM chapters c
  WHERE c.book_id = ? AND c.deleted_at IS NULL
    AND (SELECT count(*) FROM chapters o WHERE o.book_id = c.book_id AND o.deleted_at IS NULL) = 1
    AND trim(coalesce(c.title, '')) = '' AND trim(coalesce(c.summary, '')) = ''
    AND trim(coalesce(c.notes, '')) = '' AND trim(coalesce(c.story_time, '')) = ''
    AND coalesce(c.labels, '[]') IN ('[]', '')
    AND c.pov_entry_id IS NULL AND c.location_entry_id IS NULL AND c.template_beat_key IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM beats b WHERE b.parent_id = c.id OR b.parent_id IN (SELECT id FROM scenes WHERE chapter_id = c.id)
    )
    AND NOT EXISTS (SELECT 1 FROM entity_links l WHERE l.chapter_id = c.id)
    AND NOT EXISTS (
      SELECT 1 FROM scenes s
      WHERE s.chapter_id = c.id AND s.deleted_at IS NULL AND (s.is_implicit = 0 OR s.word_count > 0)
    )`

export interface WizardResult {
  changes: ChangeSet
  chapters: number
  characters: number
  /** Whether the chapters took the place of the book's one blank chapter. */
  replacedBlank: boolean
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What the toast says once a plan is saved. `current` is the book's synopsis before it, which the plan may replace. */
export function wizardMessage(
  result: Pick<WizardResult, "chapters" | "characters">,
  plan: Pick<WizardPlan, "premise" | "synopsis">,
  current: string | null | undefined,
): string {
  const synopsis = plan.synopsis.trim()
  const replaced = !!synopsis && !!current?.trim() && current.trim() !== synopsis
  const added = [
    result.chapters > 0 && count(result.chapters, "chapter", "chapters"),
    result.characters > 0 && count(result.characters, "character", "characters"),
  ].filter(Boolean)
  if (added.length > 0) return `Added ${added.join(" and ")}${replaced ? ", and replaced your synopsis" : ""}`
  if (replaced) return plan.premise ? "Saved your premise and replaced your synopsis" : "Replaced your synopsis"
  if (plan.premise && synopsis) return "Saved your premise and synopsis"
  return plan.premise ? "Saved your premise" : "Saved your synopsis"
}

/**
 * Saves a step-by-step plan. A premise or synopsis left empty keeps the book's. Characters are added to the World.
 * The chapters take the place of a book's one untouched chapter; otherwise they go after its chapters: in their
 * acts, or without them in a book that has none. Returns what Undo needs.
 */
export async function applyWizard(db: Db, bookId: string, plan: WizardPlan): Promise<WizardResult> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    const book = await tx.get<{ universe_id: string; target_words: number | null }>(
      "SELECT universe_id, target_words FROM books WHERE id = ?",
      [bookId],
    )

    const values: Record<string, string> = {}
    if (plan.premise.trim()) values.premise = plan.premise.trim()
    if (plan.synopsis.trim()) values.synopsis = plan.synopsis.trim()
    if (Object.keys(values).length > 0) {
      await changes.captureIds(tx, "books", [bookId])
      await updateRow(tx, "books", bookId, values)
    }

    const characters = plan.characters.filter((character) => character.name.trim())
    const colors = (
      await tx.getAll<{ color: string | null }>(
        "SELECT color FROM codex_entries WHERE universe_id = ? AND deleted_at IS NULL",
        [book.universe_id],
      )
    ).map((row) => row.color)
    for (const character of characters) {
      const color = nextColor(colors)
      colors.push(color)
      const fields: Record<string, string> = {}
      if (character.role.trim()) fields.Role = character.role.trim()
      if (character.goal.trim()) fields.Goal = character.goal.trim()
      await insertCodexEntry(tx, { bookId, typeKey: "characters", name: character.name, color, fields }, changes)
    }

    const acts = plan.acts.filter((act) => act.chapters.length > 0)
    const count = acts.reduce((sum, act) => sum + act.chapters.length, 0)
    const result = { changes, chapters: count, characters: characters.length, replacedBlank: false }
    if (count === 0) return result

    let bookActs = sortByPosition(await tx.getAll<ActRow>("SELECT * FROM acts WHERE book_id = ?", [bookId]))
    const { live } = await tx.get<{ live: number }>(
      "SELECT count(*) AS live FROM chapters WHERE book_id = ? AND deleted_at IS NULL",
      [bookId],
    )
    const blank = await tx.getOptional<{ id: string }>(BLANK_CHAPTER_SQL, [bookId])
    if (blank) {
      result.replacedBlank = true
      await changes.captureIds(tx, "chapters", [blank.id])
      // An empty implicit scene keeps it from being deleted outright, so it goes to the Trash.
      const scene = await tx.getOptional("SELECT id FROM scenes WHERE chapter_id = ? LIMIT 1", [blank.id])
      if (scene) await updateRow(tx, "chapters", blank.id, { deleted_at: new Date().toISOString() })
      else await tx.execute("DELETE FROM chapters WHERE id = ?", [blank.id])
      // Acts it leaves empty go too, unless the writer named them.
      for (const act of bookActs) {
        if (act.title?.trim()) continue
        if (await tx.getOptional("SELECT 1 AS used FROM chapters WHERE act_id = ? LIMIT 1", [act.id])) continue
        await changes.captureIds(tx, "acts", [act.id])
        await tx.execute("DELETE FROM acts WHERE id = ?", [act.id])
      }
      bookActs = sortByPosition(await tx.getAll<ActRow>("SELECT * FROM acts WHERE book_id = ?", [bookId]))
    }
    const kept = blank ? 0 : live
    // Chapters that make up the whole book share its target; added ones get the usual one.
    const wordTarget =
      kept === 0 ? shareOfTarget(book.target_words, count, DEFAULT_CHAPTER_TARGET) : DEFAULT_CHAPTER_TARGET

    const insertChapter = async (
      chapter: { title: string; summary: string },
      actId: string | null,
      position: string,
    ) => {
      const id = newId()
      await insertRow(
        tx,
        "chapters",
        newChapterRow({
          id,
          book_id: bookId,
          act_id: actId,
          position,
          title: chapter.title,
          summary: chapter.summary,
          word_target: wordTarget,
        }),
      )
      changes.created(tx, "chapters", id)
    }

    if (bookActs.length === 0 && kept > 0) {
      // A book without acts keeps it that way: the chapters go at its end.
      const all = sortByPosition(await tx.getAll<ChapterRow>("SELECT * FROM chapters WHERE book_id = ?", [bookId]))
      const keys = generateNKeysBetween(all.at(-1)?.position ?? null, null, count)
      let index = 0
      for (const act of acts) for (const chapter of act.chapters) await insertChapter(chapter, null, keys[index++])
      return result
    }

    const firstNewAct = bookActs.length === 0
    const actKeys = generateNKeysBetween(bookActs.at(-1)?.position ?? null, null, acts.length)
    for (const [index, act] of acts.entries()) {
      const actId = newId()
      await insertRow(tx, "acts", { id: actId, book_id: bookId, title: act.title, position: actKeys[index] })
      changes.created(tx, "acts", actId)
      if (index === 0 && firstNewAct) {
        // A book has acts for all its chapters or none: the first act takes those in the Trash.
        await changes.capture(tx, "chapters", "book_id = ? AND act_id IS NULL", [bookId])
        await tx.execute("UPDATE chapters SET act_id = ? WHERE book_id = ? AND act_id IS NULL", [actId, bookId])
      }
      const keys = generateNKeysBetween(null, null, act.chapters.length)
      for (const [place, chapter] of act.chapters.entries()) await insertChapter(chapter, actId, keys[place])
    }
    return result
  })
}
