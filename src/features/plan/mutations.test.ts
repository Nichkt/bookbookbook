import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { ChangeSet } from "@/db/changes"
import type { Db } from "@/db/tx"
import { buildBook, chapterRow, dump, outline, sceneRow } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  addBeat,
  createAct,
  createChapter,
  createScene,
  deleteAct,
  deleteBeat,
  mergeActIntoPrevious,
  mergeChapterIntoPrevious,
  moveAct,
  moveBeat,
  moveChapter,
  moveScene,
  restoreChapter,
  restoreScene,
  setChapterLinks,
  splitActAt,
  splitChapterAt,
  splitTarget,
  trashChapter,
  trashScene,
} from "./mutations"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const undo = (changes: ChangeSet) => db.writeTransaction((tx) => changes.revert(tx))
const threeActs = {
  acts: [
    { title: "One", chapters: [{ title: "A" }, { title: "B" }] },
    { title: "Two", chapters: [{ title: "C" }] },
    { title: "Three", chapters: [{ title: "D" }, { title: "E" }] },
  ],
}

async function links(database: Db, chapterId: string) {
  const rows = await database.getAll<{ role: string; entry_id: string }>(
    "SELECT role, entry_id FROM entity_links WHERE chapter_id = ? ORDER BY role, entry_id",
    [chapterId],
  )
  return rows.map((row) => `${row.role}:${row.entry_id}`)
}

describe("chapters", () => {
  test("createChapter appends or inserts within an act", async () => {
    await buildBook(db, threeActs)
    const id = await createChapter(db, "book", { actId: "act-One" }, { title: "New" })
    await createChapter(db, "book", { actId: "act-Three", index: 0 }, { title: "First" })
    expect(await outline(db)).toEqual(["# One", "A", "B", "New", "# Two", "C", "# Three", "First", "D", "E"])
    expect(await chapterRow(db, id)).toMatchObject({ status: "idea", word_target: 3000, labels: "[]", notes: "" })
  })

  test("a book without acts keeps its chapters act-less", async () => {
    await buildBook(db, { chapters: [{ title: "A" }] })
    const id = await createChapter(db, "book", { actId: null, index: 0 }, { title: "Zero" })
    expect(await outline(db)).toEqual(["Zero", "A"])
    expect((await chapterRow(db, id)).act_id).toBeNull()
  })

  test("moveChapter reorders within an act and moves between acts", async () => {
    await buildBook(db, threeActs)
    await moveChapter(db, "ch-A", { actId: "act-One", index: 1 })
    expect(await outline(db)).toEqual(["# One", "B", "A", "# Two", "C", "# Three", "D", "E"])
    await moveChapter(db, "ch-E", { actId: "act-Two", index: 0 })
    expect(await outline(db)).toEqual(["# One", "B", "A", "# Two", "E", "C", "# Three", "D"])
    await moveChapter(db, "ch-B", { actId: "act-Three", index: 99 })
    expect(await outline(db)).toEqual(["# One", "A", "# Two", "E", "C", "# Three", "D", "B"])
  })

  test("moving between chapters with equal positions re-keys the act", async () => {
    await buildBook(db, { chapters: [{ title: "A" }, { title: "B" }, { title: "C" }] })
    // Two devices both inserted at the same spot.
    await db.execute("UPDATE chapters SET position = 'a1' WHERE id IN ('ch-B', 'ch-C')")
    await moveChapter(db, "ch-A", { actId: null, index: 1 })
    expect(await outline(db)).toEqual(["B", "A", "C"])
    const positions = await db.getAll<{ position: string }>("SELECT position FROM chapters ORDER BY position")
    expect(new Set(positions.map((row) => row.position)).size).toBe(3)
  })

  test("trash, undo and restore", async () => {
    await buildBook(db, threeActs)
    const changes = await trashChapter(db, "ch-C")
    expect(await outline(db)).toEqual(["# One", "A", "B", "# Two", "# Three", "D", "E"])
    await undo(changes)
    expect(await outline(db)).toEqual(threeActOutline)
    await trashChapter(db, "ch-C")
    await restoreChapter(db, "ch-C")
    expect(await outline(db)).toEqual(threeActOutline)
  })

  test("a chapter whose act was deleted comes back at the end of the book", async () => {
    await buildBook(db, threeActs)
    await trashChapter(db, "ch-C")
    await db.execute("DELETE FROM acts WHERE id = 'act-Two'")
    await restoreChapter(db, "ch-C")
    expect(await outline(db)).toEqual(["# One", "A", "B", "# Three", "D", "E", "C"])
  })
})

const threeActOutline = ["# One", "A", "B", "# Two", "C", "# Three", "D", "E"]

describe("acts", () => {
  test("the first act takes every chapter, Trash included", async () => {
    await buildBook(db, { chapters: [{ title: "A" }, { title: "B", deleted: true }] })
    const actId = await createAct(db, "book", { title: "One" })
    const rows = await db.getAll<{ act_id: string }>("SELECT act_id FROM chapters")
    expect(rows.map((row) => row.act_id)).toEqual([actId, actId])
    await createAct(db, "book", { title: "Two" })
    expect(await outline(db)).toEqual(["# One", "A", "# Two"])
  })

  test("moveAct reorders acts", async () => {
    await buildBook(db, threeActs)
    await moveAct(db, "act-Three", 0)
    expect(await outline(db)).toEqual(["# Three", "D", "E", "# One", "A", "B", "# Two", "C"])
  })

  test("deleting an act moves its chapters to the previous act, or the next, or out of acts", async () => {
    await buildBook(db, threeActs)
    await deleteAct(db, "act-Two", "keep")
    expect(await outline(db)).toEqual(["# One", "A", "B", "C", "# Three", "D", "E"])
    await deleteAct(db, "act-One", "keep")
    expect(await outline(db)).toEqual(["# Three", "A", "B", "C", "D", "E"])
    await deleteAct(db, "act-Three", "keep")
    expect(await outline(db)).toEqual(["A", "B", "C", "D", "E"])
    const rows = await db.getAll<{ act_id: string | null }>("SELECT act_id FROM chapters")
    expect(rows.every((row) => row.act_id === null)).toBe(true)
  })

  test("deleting an act with its chapters trashes them, and undo brings everything back", async () => {
    await buildBook(db, threeActs)
    const before = await dump(db)
    const changes = await deleteAct(db, "act-Three", "trash")
    expect(await outline(db)).toEqual(["# One", "A", "B", "# Two", "C"])
    const trashed = await db.getAll<{ id: string; act_id: string }>(
      "SELECT id, act_id FROM chapters WHERE deleted_at IS NOT NULL ORDER BY id",
    )
    expect(trashed).toEqual([
      { id: "ch-D", act_id: "act-Two" },
      { id: "ch-E", act_id: "act-Two" },
    ])
    await undo(changes)
    expect(await dump(db)).toEqual(before)
  })

  test("Tab on an act folds it into the previous one", async () => {
    await buildBook(db, threeActs)
    expect(await mergeActIntoPrevious(db, "act-One")).toBeNull()
    const result = await mergeActIntoPrevious(db, "act-Three")
    expect(result?.actId).toBe("act-Two")
    expect(await outline(db)).toEqual(["# One", "A", "B", "# Two", "C", "D", "E"])
  })

  test("Shift+Tab on a chapter starts a new act there", async () => {
    await buildBook(db, threeActs)
    expect(await splitActAt(db, "ch-A")).toBeNull()
    const before = await dump(db)
    const result = await splitActAt(db, "ch-B")
    expect(await outline(db)).toEqual(["# One", "A", "# ?", "B", "# Two", "C", "# Three", "D", "E"])
    await undo(result!.changes)
    expect(await dump(db)).toEqual(before)
  })

  test("Shift+Tab in a book without acts creates two acts", async () => {
    await buildBook(db, { chapters: [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "T", deleted: true }] })
    await splitActAt(db, "ch-B")
    expect(await outline(db)).toEqual(["# ?", "A", "# ?", "B", "C"])
    expect((await chapterRow(db, "ch-T")).act_id).not.toBeNull()
  })
})

describe("folding chapters into scenes (Tab) and splitting them out (Shift+Tab)", () => {
  test("planned chapters fold into scenes and split back", async () => {
    await buildBook(db, {
      acts: [
        {
          title: "One",
          chapters: [
            { title: "A", summary: "a summary" },
            { title: "B", summary: "b summary", pov: "jonas", time: "Day 2" },
            { title: "C" },
          ],
        },
      ],
    })
    expect(await mergeChapterIntoPrevious(db, "ch-A")).toBeNull()

    const fold = await mergeChapterIntoPrevious(db, "ch-B")
    expect(fold?.chapterId).toBe("ch-A")
    expect(await outline(db)).toEqual(["# One", "A: A, B", "C"])
    const scenes = await db.getAll<{ id: string; title: string; summary: string; pov_entry_id: string | null }>(
      "SELECT id, title, summary, pov_entry_id, story_time FROM scenes ORDER BY position",
    )
    expect(scenes[1]).toMatchObject({ title: "B", summary: "b summary", pov_entry_id: "jonas", story_time: "Day 2" })
    expect(fold?.sceneId).toBe(scenes[1].id)

    const split = await splitChapterAt(db, scenes[1].id)
    expect(await outline(db)).toEqual(["# One", "A: ~", "B: ~", "C"])
    expect(await chapterRow(db, split!.chapterId)).toMatchObject({
      title: "B",
      summary: "b summary",
      pov_entry_id: "jonas",
      story_time: "Day 2",
    })
  })

  test("written text is kept: implicit scenes become real scenes", async () => {
    await buildBook(db, {
      chapters: [
        { title: "A", scenes: [{ implicit: true, written: true, words: 100 }] },
        { title: "B", summary: "b summary", scenes: [{ implicit: true, written: true, words: 50 }] },
      ],
    })
    await mergeChapterIntoPrevious(db, "ch-B")
    expect(await outline(db)).toEqual(["A: A, B"])
    expect(await sceneRow(db, "sc-A-1")).toMatchObject({ chapter_id: "ch-A", is_implicit: 0, title: "A" })
    expect(await sceneRow(db, "sc-B-1")).toMatchObject({ chapter_id: "ch-A", is_implicit: 0, summary: "b summary" })
    expect(await db.getOptional("SELECT id FROM chapters WHERE id = 'ch-B'")).toBeNull()
  })

  test("several scenes move together, Trash included, and B's summary goes to the notes", async () => {
    await buildBook(db, {
      chapters: [
        { title: "A", notes: "A notes", scenes: [{ title: "a1" }, { title: "a2" }] },
        {
          title: "B",
          summary: "b summary",
          notes: "B notes",
          scenes: [{ title: "b1" }, { title: "gone", deleted: true }, { title: "b2" }],
        },
      ],
    })
    const fold = await mergeChapterIntoPrevious(db, "ch-B")
    expect(fold?.sceneId).toBe("sc-B-1")
    expect(await outline(db)).toEqual(["A: a1, a2, b1, b2"])
    expect((await sceneRow(db, "sc-B-2")).chapter_id).toBe("ch-A")
    expect((await chapterRow(db, "ch-A")).notes).toBe("A notes\n\n— From “B” —\n\nb summary\n\nB notes")
  })

  test("beats, links, targets and labels merge", async () => {
    await buildBook(db, {
      chapters: [
        { title: "A", beats: ["a beat"], threads: ["ledger"], present: ["mara"], labels: ["storm"], target: 2000 },
        {
          title: "B",
          beats: ["b beat"],
          threads: ["ledger", "debts"],
          present: ["jonas"],
          labels: ["Storm", "key"],
          target: 1500,
          pov: "jonas",
        },
      ],
    })
    await mergeChapterIntoPrevious(db, "ch-B")
    const beats = await db.getAll<{ text: string }>(
      "SELECT text FROM beats WHERE parent_id = 'ch-A' ORDER BY position",
    )
    expect(beats.map((beat) => beat.text)).toEqual(["a beat", "b beat"])
    expect(await links(db, "ch-A")).toEqual(["present:jonas", "present:mara", "thread:debts", "thread:ledger"])
    expect(await chapterRow(db, "ch-A")).toMatchObject({
      word_target: 3500,
      labels: '["storm","key"]',
      pov_entry_id: "jonas",
    })
  })

  test("undo restores a fold exactly", async () => {
    await buildBook(db, {
      chapters: [
        { title: "A", beats: ["a"], threads: ["ledger"], scenes: [{ implicit: true, written: true, words: 10 }] },
        { title: "B", beats: ["b"], threads: ["ledger"], notes: "n", scenes: [{ implicit: true }] },
        { title: "C" },
      ],
    })
    const before = await dump(db)
    const fold = await mergeChapterIntoPrevious(db, "ch-B")
    await undo(fold!.changes)
    expect(await dump(db)).toEqual(before)

    const emptyFold = await mergeChapterIntoPrevious(db, "ch-C")
    expect(await outline(db)).toEqual(["A: ~", "B: B, C"])
    await undo(emptyFold!.changes)
    expect(await dump(db)).toEqual(before)
  })

  test("Shift+Tab splits at a scene, sharing the target by words", async () => {
    await buildBook(db, {
      acts: [
        {
          title: "One",
          chapters: [
            {
              title: "A",
              target: 3000,
              threads: ["ledger"],
              present: ["mara"],
              labels: ["storm"],
              beats: ["stays"],
              scenes: [
                { title: "a1", words: 100 },
                { title: "a2", words: 200, summary: "two" },
                { title: "a3", words: 300 },
              ],
            },
            { title: "Z" },
          ],
        },
      ],
    })
    expect(await splitChapterAt(db, "sc-A-1")).toBeNull()
    const before = await dump(db)
    const split = await splitChapterAt(db, "sc-A-2")
    // A keeps a1 as a real scene: its title says something the chapter's doesn't.
    expect(await outline(db)).toEqual(["# One", "A: a1", "a2: a2, a3", "Z"])
    expect(await chapterRow(db, split!.chapterId)).toMatchObject({
      act_id: "act-One",
      summary: "",
      word_target: 2500,
      labels: '["storm"]',
    })
    expect((await chapterRow(db, "ch-A")).word_target).toBe(500)
    expect(await links(db, split!.chapterId)).toEqual(["present:mara", "thread:ledger"])
    const beats = await db.getAll<{ parent_id: string }>("SELECT parent_id FROM beats")
    expect(beats).toEqual([{ parent_id: "ch-A" }])
    await undo(split!.changes)
    expect(await dump(db)).toEqual(before)
  })

  test("splitTarget rounds", () => {
    expect(splitTarget(3000, 1 / 3)).toEqual([2000, 1000])
    expect(splitTarget(2800, 1 / 3)).toEqual([1850, 950])
    expect(splitTarget(500, 0.5)).toEqual([250, 250])
    expect(splitTarget(null, 0.5)).toEqual([null, null])
  })
})

describe("scenes", () => {
  test("adding a scene to a blank chapter turns its implicit scene into the new one", async () => {
    await buildBook(db, { chapters: [{ title: "A", scenes: [{ implicit: true }] }] })
    const id = await createScene(db, "ch-A", { title: "First" })
    expect(id).toBe("sc-A-1")
    expect(await outline(db)).toEqual(["A: First"])
  })

  test("adding a scene after written text keeps the text as the first scene", async () => {
    await buildBook(db, { chapters: [{ title: "A", scenes: [{ implicit: true, written: true }] }] })
    await createScene(db, "ch-A", { title: "Second" })
    expect(await outline(db)).toEqual(["A: ?, Second"])
  })

  test("moveScene reorders", async () => {
    await buildBook(db, { chapters: [{ title: "A", scenes: [{ title: "1" }, { title: "2" }, { title: "3" }] }] })
    await moveScene(db, "sc-A-3", 0)
    expect(await outline(db)).toEqual(["A: 3, 1, 2"])
  })

  test("restoring a scene restores its chapter and replaces a blank placeholder", async () => {
    await buildBook(db, { chapters: [{ title: "A", scenes: [{ title: "only" }] }, { title: "B" }] })
    await trashScene(db, "sc-A-1")
    // Opening the emptied chapter created a blank implicit scene.
    await db.execute(
      "INSERT INTO scenes (id, chapter_id, position, is_implicit, title, summary) VALUES ('blank', 'ch-A', 'a0', 1, '', '')",
    )
    await trashChapter(db, "ch-A")
    await restoreScene(db, "sc-A-1")
    expect(await outline(db)).toEqual(["A: only", "B"])
    expect(await db.getOptional("SELECT id FROM scenes WHERE id = 'blank'")).toBeNull()
  })
})

describe("beats and links", () => {
  test("add, move and delete beats with undo", async () => {
    await buildBook(db, { chapters: [{ title: "A", beats: ["one", "two"] }] })
    const id = await addBeat(db, "ch-A", 1, "middle")
    await moveBeat(db, "beat-A-1", 2)
    const texts = async () =>
      (await db.getAll<{ text: string }>("SELECT text FROM beats ORDER BY position")).map((row) => row.text)
    expect(await texts()).toEqual(["middle", "two", "one"])
    const changes = await deleteBeat(db, id)
    expect(await texts()).toEqual(["two", "one"])
    await undo(changes)
    expect(await texts()).toEqual(["middle", "two", "one"])
  })

  test("setChapterLinks makes the set exact and drops duplicates", async () => {
    await buildBook(db, { chapters: [{ title: "A", threads: ["ledger", "debts"] }] })
    await db.execute(
      "INSERT INTO entity_links (id, chapter_id, entry_id, role) VALUES ('dupe', 'ch-A', 'ledger', 'thread')",
    )
    await setChapterLinks(db, "ch-A", "thread", ["ledger", "grief"])
    expect(await links(db, "ch-A")).toEqual(["thread:grief", "thread:ledger"])
  })
})
