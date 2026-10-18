import { ChangeSet } from "@/db/changes"
import { insertRow, type Db } from "@/db/tx"
import { newId } from "@/lib/id"
import { isProviderId, type ProviderId } from "./providers"
import type { AiErrorKind, ChatResult } from "./stream"
import { NAMED_IDEAS, type ToolOutput } from "./tools"

/*
 * Result cards (DESIGN.md §9 "Tools"), newest first in the AI panel, like Sudowrite's History. Each is an `ai_cards`
 * row whose `output` holds the answers as they came, with what was asked, so a card can be inserted or retried after
 * a reload. A card's text streams in memory (runs.ts); the row is written when it starts and when it ends.
 */

export type CardStatus = "running" | "done" | "stopped" | "error"
const STATUSES: readonly CardStatus[] = ["running", "done", "stopped", "error"]
const OUTPUTS: readonly ToolOutput[] = ["prose", "senses", "ideas", "names", "summary", "feedback"]
const ERROR_KINDS: readonly AiErrorKind[] = ["network", "key", "model", "limit", "request", "server", "answer"]

export interface CardSelection {
  text: string
  from: number
  to: number
}

export interface CardRequest {
  tool: string
  toolName: string
  output: ToolOutput
  placement: "insert" | "replace" | null
  fields: Record<string, string>
  sceneId: string | null
  chapterId: string | null
  /** What a tool that replaces the selection was given, and where it was, to find it again. */
  selection?: CardSelection
}

export interface CardOutput {
  v: 1
  status: CardStatus
  /** The answers as they came, one per variant: cards parse them when they show them. */
  variants: string[]
  error?: { kind: AiErrorKind; message: string }
  /** Tokens, as the provider counted them, across the variants. */
  usage?: { input: number; output: number } | null
  /** "length" when an answer ran into its limit; "refused" when the provider wouldn't write it. */
  finish?: ChatResult["finish"]
  /** Whether some context was left out to fit. */
  trimmed?: boolean
  /** The variants that went into the book. */
  used?: number[]
  request: CardRequest
}

export interface CardRow {
  id: string
  scene_id: string | null
  tool: string | null
  model: string | null
  route: string | null
  output: string | null
  created_at: string | null
}

export const CARDS_SQL = `
  SELECT id, scene_id, tool, model, route, output, created_at FROM ai_cards
  WHERE book_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`

/** Older cards than this are deleted as new ones come. */
const KEEP_CARDS = 100

export interface Card {
  id: string
  model: string
  /** Where the request went. */
  route: ProviderId | null
  createdAt: string
  output: CardOutput
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0

function parseRequest(value: unknown): CardRequest | null {
  if (!isRecord(value) || !isString(value.tool) || !OUTPUTS.includes(value.output as ToolOutput)) return null
  const placement = value.placement === "insert" || value.placement === "replace" ? value.placement : null
  const fields: Record<string, string> = {}
  if (isRecord(value.fields)) {
    for (const [key, field] of Object.entries(value.fields)) if (isString(field)) fields[key] = field
  }
  const selection = value.selection
  return {
    tool: value.tool,
    toolName: isString(value.toolName) ? value.toolName : value.tool,
    output: value.output as ToolOutput,
    placement,
    fields,
    sceneId: isString(value.sceneId) ? value.sceneId : null,
    chapterId: isString(value.chapterId) ? value.chapterId : null,
    ...(isRecord(selection) && isString(selection.text) && isCount(selection.from) && isCount(selection.to)
      ? { selection: { text: selection.text, from: selection.from, to: selection.to } }
      : {}),
  }
}

export function parseOutput(raw: string | null): CardOutput | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const request = parseRequest(value.request)
  if (!request || !STATUSES.includes(value.status as CardStatus)) return null
  const error = value.error
  const usage = value.usage
  const finish = value.finish
  return {
    v: 1,
    status: value.status as CardStatus,
    variants: Array.isArray(value.variants) ? value.variants.filter(isString) : [],
    ...(isRecord(error) && isString(error.message)
      ? {
          error: {
            kind: ERROR_KINDS.includes(error.kind as AiErrorKind) ? (error.kind as AiErrorKind) : "request",
            message: error.message,
          },
        }
      : {}),
    ...(isRecord(usage) && isCount(usage.input) && isCount(usage.output)
      ? { usage: { input: usage.input, output: usage.output } }
      : {}),
    ...(finish === "stop" || finish === "length" || finish === "refused" ? { finish } : {}),
    ...(value.trimmed === true ? { trimmed: true } : {}),
    ...(Array.isArray(value.used) ? { used: value.used.filter(isCount) } : {}),
    request,
  }
}

export function parseCard(row: CardRow): Card | null {
  const output = parseOutput(row.output)
  if (!output) return null
  return {
    id: row.id,
    model: row.model ?? "",
    route: isProviderId(row.route) ? row.route : null,
    createdAt: row.created_at ?? "",
    output,
  }
}

export interface NewCard {
  bookId: string
  model: string
  route: ProviderId
  output: CardOutput
}

/** Adds a card and deletes the book's oldest past KEEP_CARDS. */
export async function createCard(db: Db, card: NewCard): Promise<string> {
  const id = newId()
  await db.writeTransaction(async (tx) => {
    await insertRow(tx, "ai_cards", {
      id,
      book_id: card.bookId,
      scene_id: card.output.request.sceneId,
      tool: card.output.request.tool,
      model: card.model,
      route: card.route,
      output: JSON.stringify(card.output),
      // Hosted AI's credits (DESIGN.md §9) aren't built: requests go to the writer's own account or computer.
      credits: null,
      created_at: new Date().toISOString(),
    })
    await tx.execute(
      `DELETE FROM ai_cards WHERE book_id = ? AND id NOT IN (
         SELECT id FROM ai_cards WHERE book_id = ? ORDER BY created_at DESC, id DESC LIMIT ${KEEP_CARDS})`,
      [card.bookId, card.bookId],
    )
  })
  return id
}

export async function saveOutput(db: Db, id: string, output: CardOutput) {
  await db.execute("UPDATE ai_cards SET output = ? WHERE id = ?", [JSON.stringify(output), id])
}

/** Notes that a variant went into the book, so its card says so. */
export async function markUsed(db: Db, id: string, variant: number) {
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ output: string | null }>("SELECT output FROM ai_cards WHERE id = ?", [id])
    const output = parseOutput(row?.output ?? null)
    if (!output || output.used?.includes(variant)) return
    output.used = [...(output.used ?? []), variant].sort((a, b) => a - b)
    await tx.execute("UPDATE ai_cards SET output = ? WHERE id = ?", [JSON.stringify(output), id])
  })
}

export async function dismissCard(db: Db, id: string) {
  await db.execute("DELETE FROM ai_cards WHERE id = ?", [id])
}

/** Deletes a book's cards. Returns what Undo needs. */
export async function clearCards(db: Db, bookId: string): Promise<ChangeSet> {
  return db.writeTransaction(async (tx) => {
    const changes = new ChangeSet()
    await changes.capture(tx, "ai_cards", "book_id = ?", [bookId])
    await tx.execute("DELETE FROM ai_cards WHERE book_id = ?", [bookId])
    return changes
  })
}

/** What can be done with each idea on a card, besides copying it. */
export interface IdeaActions {
  /** Add it to the chapter's moments. */
  moment: boolean
  /** Add it to the World, when it starts with a name. */
  world: boolean
  /** Make it the chapter's title. */
  title: boolean
}

/** Brainstormed characters, places and titles aren't things that happen, so they don't make moments. */
const NOT_MOMENTS: ReadonlySet<string> = new Set([...NAMED_IDEAS, "titles"])

export function ideaActions(request: CardRequest): IdeaActions {
  if (request.tool !== "brainstorm") return { moment: true, world: true, title: false }
  const category = request.fields.category ?? ""
  return { moment: !NOT_MOMENTS.has(category), world: NAMED_IDEAS.has(category), title: category === "titles" }
}

/** Names for these sound like places rather than people. */
const PLACE_WORDS =
  /\b(?:places?|towns?|cit(?:y|ies)|villages?|lands?|regions?|islands?|kingdoms?|realms?|countr(?:y|ies)|streets?|rivers?|mountains?|forests?|planets?|inns?|taverns?|castles?|stations?|harbou?rs?|ports?)\b/i

/** The key of the World type a card's ideas or names go under: places or people, or for other tools none. */
export function worldTypeFor(request: CardRequest): string | null {
  if (request.tool === "brainstorm") {
    const category = request.fields.category
    return category === "places" ? "locations" : category === "characters" ? "characters" : null
  }
  if (request.tool === "names") return PLACE_WORDS.test(request.fields.kind ?? "") ? "locations" : "characters"
  return null
}
