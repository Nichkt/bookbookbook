import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { seedIfEmpty } from "@/db/seed"
import { createTestDb } from "@/test/sqliteDb"
import { buildMatrix, quietStretches, stretchLabel, type MatrixRow } from "./matrixData"
import { readPlan } from "./planData"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

async function sampleMatrix(mentions?: Parameters<typeof buildMatrix>[1]) {
  await seedIfEmpty(db)
  const { id } = await db.get<{ id: string }>("SELECT id FROM books")
  return buildMatrix(await readPlan(db, id), mentions)
}

const row = (rows: MatrixRow[], name: string) => {
  const found = rows.find((candidate) => candidate.entry.name === name)
  if (!found) throw new Error(`No row “${name}”`)
  return found
}

/** A row as one character per chapter: ★ point of view, ● present, ○ mentioned, · neither. */
const glyphs = (matrixRow: MatrixRow) =>
  matrixRow.marks.map((mark) => ({ pov: "★", present: "●", mentioned: "○", none: "·" })[mark]).join("")

describe("quietStretches", () => {
  test("finds gaps of three or more chapters between two the story point is in", () => {
    const on = (pattern: string) => [...pattern].map((char) => char === "x")
    expect(quietStretches(on("x...x"))).toEqual([{ from: 1, to: 3, length: 3 }])
    expect(quietStretches(on("x..x..x"))).toEqual([])
    expect(quietStretches(on("x....x...x"))).toEqual([
      { from: 1, to: 4, length: 4 },
      { from: 6, to: 8, length: 3 },
    ])
  })

  test("before the first chapter and after the last isn't quiet: it hasn't started or has ended", () => {
    const on = (pattern: string) => [...pattern].map((char) => char === "x")
    expect(quietStretches(on("....x....x....."))).toEqual([{ from: 5, to: 8, length: 4 }])
    expect(quietStretches(on("......"))).toEqual([])
    expect(quietStretches(on("x"))).toEqual([])
  })
})

describe("buildMatrix on the sample book", () => {
  test("characters and story points in the World's order, chapters in reading order", async () => {
    const matrix = await sampleMatrix()
    expect(matrix.columns.map((chapter) => chapter.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(matrix.characters.map((character) => character.entry.name)).toEqual([
      "Agnes Morrow",
      "Elias Penhallow",
      "Jonas Quill",
      "Mara Quill",
      "Thomas Quill",
    ])
    expect(matrix.threads.map((thread) => thread.entry.name)).toEqual([
      "Grief",
      "Jonas's debts",
      "Ledger mystery",
      "Mara & Elias",
    ])
    expect(matrix.acts.map((act) => [act.label, act.span])).toEqual([
      ["ACT I — Arrival", 4],
      ["ACT II — The Ledger", 5],
      ["ACT III — The Light", 3],
    ])
  })

  test("a chapter's point of view outranks being present", async () => {
    const matrix = await sampleMatrix()
    const mara = row(matrix.characters, "Mara Quill")
    expect(mara.marks[0]).toBe("pov")
    expect(row(matrix.characters, "Jonas Quill").marks[3]).toBe("pov")
    expect(row(matrix.characters, "Thomas Quill").marks[8]).toBe("pov")
    expect(glyphs(row(matrix.characters, "Jonas Quill"))[0]).toBe("●")
  })

  test("Grief goes quiet for chapters 3–5; no other story point does", async () => {
    const matrix = await sampleMatrix()
    const grief = row(matrix.threads, "Grief")
    expect(glyphs(grief)).toBe("●●···●··●·●●")
    expect(grief.quiet).toEqual([{ from: 2, to: 4, length: 3 }])
    expect(stretchLabel(grief.quiet[0], matrix.columns)).toBe("chapters 3–5")
    for (const name of ["Jonas's debts", "Ledger mystery", "Mara & Elias"]) {
      expect(row(matrix.threads, name).quiet).toEqual([])
    }
  })

  test("a character mentioned in the prose but not marked present shows as mentioned", async () => {
    await seedIfEmpty(db)
    const { id } = await db.get<{ id: string }>("SELECT id FROM codex_entries WHERE name = 'Agnes Morrow'")
    const chapterIds = (await db.getAll<{ id: string; title: string }>("SELECT id, title FROM chapters")).filter(
      (chapter) => chapter.title === "The Ferry Home" || chapter.title === "The Keeper's Room",
    )
    const counts = new Map(chapterIds.map((chapter) => [chapter.id, 2]))
    const matrix = await sampleMatrix(new Map([[id, counts]]))
    const agnes = row(matrix.characters, "Agnes Morrow")
    // Present in chapter 2 already, so its mentions change nothing there.
    expect(agnes.marks.slice(0, 2)).toEqual(["mentioned", "present"])
    expect(agnes.mentions.slice(0, 3)).toEqual([2, 2, 0])
    expect(agnes.quiet).toEqual([])
  })
})

test("a book without acts has no act headings", async () => {
  await seedIfEmpty(db)
  await db.execute("UPDATE chapters SET act_id = NULL")
  await db.execute("DELETE FROM acts")
  const { id } = await db.get<{ id: string }>("SELECT id FROM books")
  const matrix = buildMatrix(await readPlan(db, id))
  expect(matrix.acts).toEqual([])
  expect(matrix.columns).toHaveLength(12)
})
