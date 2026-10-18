import { create } from "zustand"
import type { Db } from "@/db/tx"
import { createCard, saveOutput, type Card, type CardOutput, type CardRequest, type CardStatus } from "./cards"
import { cleanProse } from "./parse"
import type { Connection } from "./settings"
import { AiError, streamChat, type ChatResult } from "./stream"

/*
 * Requests in flight (DESIGN.md §9 "Tools"): each card's answers as they stream in, held in memory and drawn at most
 * once a frame, and the means to stop them. The card's row is written as its run starts and again as it ends.
 */

/** What a card shows while its run is in memory: the row only catches up as the run ends. */
export type LiveRun = Pick<CardOutput, "status" | "variants" | "error" | "usage" | "finish">

export const useRuns = create<{ runs: Readonly<Record<string, LiveRun>> }>(() => ({ runs: {} }))

export interface Prompt {
  system: string
  user: string
  maxTokens: number
}

interface Sent {
  connection: Connection
  prompt: Prompt
  variants: number
  trimmed: boolean
  request: CardRequest
}

interface Running {
  controller: AbortController
  texts: string[]
  drawing: boolean
}

const running = new Map<string, Running>()
/** What each card's run sent, so Retry can send it again. Kept while the page is open. */
const sentByCard = new Map<string, Sent>()

/** A live run is let go this long after its row has the answers, so the card never shows the row behind it. */
const LET_GO_MS = 2000

function setRun(cardId: string, run: LiveRun) {
  useRuns.setState((state) => ({ runs: { ...state.runs, [cardId]: run } }))
}

function letGo(cardId: string) {
  useRuns.setState((state) => {
    if (!(cardId in state.runs)) return state
    const runs = { ...state.runs }
    delete runs[cardId]
    return { runs }
  })
}

const nextFrame = (work: () => void) =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(work) : setTimeout(work, 16)

/** Draws what has streamed in, once a frame however many pieces arrive. */
function draw(cardId: string, entry: Running) {
  if (entry.drawing) return
  entry.drawing = true
  nextFrame(() => {
    entry.drawing = false
    if (running.get(cardId) === entry) setRun(cardId, { status: "running", variants: [...entry.texts] })
  })
}

/** What a card shows: its live run while it has one, else its row. A row left running was cut off by a reload. */
export function shownOutput(card: Card, live: LiveRun | undefined): CardOutput {
  if (card.output.status !== "running") return card.output
  if (!live) return { ...card.output, status: "stopped" }
  return { ...card.output, ...live }
}

export interface RunInput {
  db: Db
  bookId: string
  connection: Connection
  prompt: Prompt
  /** Answers to ask for, each its own request. */
  variants: number
  request: CardRequest
  /** Whether context was left out to fit. */
  trimmed: boolean
  fetcher?: typeof fetch
}

/** Adds a card and starts its requests. Resolves with the card's id once its row is written, not when it's done. */
export async function startRun(input: RunInput): Promise<string> {
  const { db, bookId, connection, request, trimmed } = input
  const output: CardOutput = { v: 1, status: "running", variants: [], request, ...(trimmed ? { trimmed } : {}) }
  const cardId = await createCard(db, { bookId, model: connection.model, route: connection.provider.id, output })
  sentByCard.set(cardId, {
    connection,
    prompt: input.prompt,
    variants: input.variants,
    trimmed,
    request,
  })
  void run(db, cardId, output, input)
  return cardId
}

const errorOf = (reason: unknown): NonNullable<CardOutput["error"]> =>
  reason instanceof AiError
    ? { kind: reason.kind, message: reason.message }
    : { kind: "request", message: "Something went wrong. Try again." }

async function run(db: Db, cardId: string, output: CardOutput, input: RunInput) {
  const { connection, prompt } = input
  const entry: Running = {
    controller: new AbortController(),
    texts: Array.from({ length: Math.max(1, input.variants) }, () => ""),
    drawing: false,
  }
  running.set(cardId, entry)
  setRun(cardId, { status: "running", variants: [...entry.texts] })

  const results = await Promise.allSettled(
    entry.texts.map((_, index) =>
      streamChat(
        {
          connection,
          system: prompt.system,
          user: prompt.user,
          maxTokens: prompt.maxTokens,
          signal: entry.controller.signal,
          onText: (piece) => {
            entry.texts[index] += piece
            draw(cardId, entry)
          },
        },
        input.fetcher,
      ),
    ),
  )
  running.delete(cardId)

  const answers = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []))
  const said = entry.texts.some((text) => cleanProse(text) !== "")
  const who = connection.provider.who
  let status: CardStatus = "done"
  let error: CardOutput["error"]
  if (entry.controller.signal.aborted) {
    status = "stopped"
  } else if (!said) {
    status = "error"
    if (failures.length > 0) error = errorOf(failures[0])
    else if (answers.some((answer) => answer.finish === "refused")) {
      error = { kind: "answer", message: `${who} declined to write this. Try rewording it, or another model.` }
    } else if (answers.some((answer) => answer.finish === "length")) {
      error = {
        kind: "answer",
        message: `${who} ran out of room before the answer began. Try again, or another model.`,
      }
    } else {
      error = { kind: "answer", message: `${who} sent back an empty answer. Try again, or another model.` }
    }
  }
  const usages = answers.flatMap((answer) => (answer.usage ? [answer.usage] : []))
  const usage =
    usages.length > 0
      ? usages.reduce((sum, next) => ({ input: sum.input + next.input, output: sum.output + next.output }))
      : null
  const finishes = new Set<ChatResult["finish"]>(answers.map((answer) => answer.finish))
  const finish: ChatResult["finish"] = finishes.has("refused") ? "refused" : finishes.has("length") ? "length" : "stop"
  const live: LiveRun = {
    status,
    variants: [...entry.texts],
    ...(error ? { error } : {}),
    ...(usage ? { usage } : {}),
    ...(status === "done" ? { finish } : {}),
  }
  setRun(cardId, live)
  try {
    await saveOutput(db, cardId, { ...output, ...live })
    setTimeout(() => letGo(cardId), LET_GO_MS)
  } catch {
    // The card shows its live run until the page closes.
  }
}

export const isRunning = (cardId: string) => running.has(cardId)

/** Stops a card's requests. What came in so far stays on the card. */
export function stopRun(cardId: string) {
  running.get(cardId)?.controller.abort()
}

export function stopAllRuns() {
  for (const entry of running.values()) entry.controller.abort()
}

/** What a card's run sent, while the page that sent it is open. */
export const sentFor = (cardId: string): Sent | undefined => sentByCard.get(cardId)

const sameConnection = (a: Connection, b: Connection) =>
  a.provider.id === b.provider.id &&
  a.model === b.model &&
  a.baseUrl === b.baseUrl &&
  a.key === b.key &&
  a.contextTokens === b.contextTokens

/**
 * Sends what a card sent again, as a new card. Null when this page didn't send it, as after a reload, or when the AI
 * settings have changed since, as after fixing a key: then the request is put together afresh.
 */
export async function retryRun(db: Db, bookId: string, cardId: string, connection: Connection): Promise<string | null> {
  const sent = sentByCard.get(cardId)
  if (!sent || !sameConnection(sent.connection, connection)) return null
  return startRun({ db, bookId, ...sent })
}
