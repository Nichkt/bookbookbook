import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ChangeSet } from "@/db/changes"
import { buildBook } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  clearCards,
  createCard,
  dismissCard,
  ideaActions,
  markUsed,
  parseCard,
  parseOutput,
  saveOutput,
  worldTypeFor,
  type CardOutput,
  type CardRequest,
} from "./cards"

let db: ReturnType<typeof createTestDb>

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "One" }] })
})

afterEach(() => db.close())

const request = (patch: Partial<CardRequest> = {}): CardRequest => ({
  tool: "brainstorm",
  toolName: "Brainstorm",
  output: "ideas",
  placement: null,
  fields: { category: "characters" },
  sceneId: "sc-One-1",
  chapterId: "ch-One",
  ...patch,
})

const output = (patch: Partial<CardOutput> = {}): CardOutput => ({
  v: 1,
  status: "done",
  variants: ["Mara: a keeper"],
  request: request(),
  ...patch,
})

const undo = (changes: ChangeSet) => db.writeTransaction((tx) => changes.revert(tx))

describe("card parsing", () => {
  it("parses card JSON defensively", () => {
    expect(parseOutput("junk")).toBeNull()
    expect(
      parseOutput(
        JSON.stringify({
          status: "done",
          variants: ["a", 1],
          error: { kind: "strange", message: "bad" },
          usage: { input: 2, output: 3 },
          finish: "length",
          used: [2, -1, "x"],
          request: request({ selection: { text: "Mara", from: 1, to: 5 } }),
        }),
      ),
    ).toMatchObject({
      status: "done",
      variants: ["a"],
      error: { kind: "request", message: "bad" },
      usage: { input: 2, output: 3 },
      finish: "length",
      used: [2],
      request: { selection: { text: "Mara", from: 1, to: 5 } },
    })
    expect(
      parseCard({
        id: "card",
        scene_id: null,
        tool: null,
        model: null,
        route: "bad",
        output: JSON.stringify(output()),
        created_at: null,
      }),
    ).toMatchObject({ id: "card", model: "", route: null, createdAt: "" })
  })

  it("chooses idea actions and world types", () => {
    expect(ideaActions(request({ tool: "rewrite", fields: {} }))).toEqual({
      moment: true,
      world: true,
      title: false,
    })
    expect(ideaActions(request({ fields: { category: "titles" } }))).toEqual({
      moment: false,
      world: false,
      title: true,
    })
    expect(worldTypeFor(request({ fields: { category: "places" } }))).toBe("locations")
    expect(worldTypeFor(request({ tool: "names", fields: { kind: "island towns" } }))).toBe("locations")
    expect(worldTypeFor(request({ tool: "names", fields: { kind: "smugglers" } }))).toBe("characters")
  })
})

describe("card database changes", () => {
  it("creates, updates, marks used and dismisses cards", async () => {
    const id = await createCard(db, { bookId: "book", model: "gpt", route: "openai", output: output() })
    await markUsed(db, id, 2)
    await markUsed(db, id, 1)
    await markUsed(db, id, 2)
    const row = await db.get<{ output: string }>("SELECT output FROM ai_cards WHERE id = ?", [id])
    expect(parseOutput(row.output)?.used).toEqual([1, 2])
    await saveOutput(db, id, output({ variants: ["new"], status: "stopped" }))
    expect(parseOutput((await db.get<{ output: string }>("SELECT output FROM ai_cards WHERE id = ?", [id])).output))
      .toMatchObject({ status: "stopped", variants: ["new"] })
    await dismissCard(db, id)
    expect(await db.getAll("SELECT id FROM ai_cards")).toEqual([])
  })

  it("prunes old cards and clearCards can be undone", async () => {
    for (let index = 0; index < 105; index++) {
      await createCard(db, { bookId: "book", model: "gpt", route: "openai", output: output() })
    }
    expect(await db.getAll("SELECT id FROM ai_cards")).toHaveLength(100)
    const before = await db.getAll("SELECT * FROM ai_cards ORDER BY id")
    const changes = await clearCards(db, "book")
    expect(await db.getAll("SELECT id FROM ai_cards")).toEqual([])
    await undo(changes)
    expect(await db.getAll("SELECT * FROM ai_cards ORDER BY id")).toEqual(before)
  })
})
