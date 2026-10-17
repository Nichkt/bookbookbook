import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertRow } from "@/db/tx"
import { restoreBackup } from "@/export/backup"
import { blocksState } from "@/export/blocks"
import { storedSceneReader } from "@/export/scenes"
import { buildBook } from "@/test/book"
import { paras, writeProse } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import { bytesToBase64 } from "@/yjs/base64"
import { recordKey } from "./record"
import { checkBook, readRecord, recordRestored, takeBackup, writingDays } from "./state"

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const at = (day: number, hour = 12) => new Date(2025, 2, day, hour)
const iso = (day: number, hour = 12) => at(day, hour).toISOString()

async function wrote(date: string, words: number, device = "dev1", bookId = "book") {
  await insertRow(db, "writing_stats", {
    id: `${device}:${bookId}:${date}`,
    book_id: bookId,
    date,
    words_added: words,
    words_removed: 0,
    ai_words_inserted: 0,
    dictated_words: 0,
    sprints: 0,
  })
}

const reader = () => storedSceneReader(db)
const check = (now: Date, bookId = "book") => checkBook(db, bookId, reader(), now)

async function seed() {
  await buildBook(db, { chapters: [{ title: "Arrival", scenes: [{ title: "Dock" }, { title: "Inn" }] }] })
  await writeProse(db, "sc-Arrival-1", paras("The ferry docked."))
}

describe("writingDays", () => {
  it("sums each day's words added and removed over every device", async () => {
    await seed()
    await wrote("2025-03-01", 100)
    await wrote("2025-03-01", 30, "dev2")
    await db.execute("UPDATE writing_stats SET words_removed = 5 WHERE id = 'dev2:book:2025-03-01'")
    await wrote("2025-03-04", 7)
    await wrote("2025-03-04", 900, "dev1", "other")
    const days = await writingDays(db, "book")
    expect(days.sort((a, b) => a.date.localeCompare(b.date))).toEqual([
      { date: "2025-03-01", words: 135 },
      { date: "2025-03-04", words: 7 },
    ])
  })
})

describe("checkBook", () => {
  it("takes a book with nothing written as backed up as it stands, the first time", async () => {
    await seed()
    const checked = await check(at(10))
    expect(checked.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await readRecord(db, "book")).toEqual({
      last: null,
      hash: checked.hash,
      hashedAt: iso(10),
      dayWords: 0,
      changedAt: null,
    })
  })

  it("dates the writing in a book that has never been backed up from its first day", async () => {
    await seed()
    await wrote("2025-03-02", 300)
    await wrote("2025-03-09", 20)
    await check(at(10))
    expect(await readRecord(db, "book")).toMatchObject({ last: null, hash: null, changedAt: new Date(2025, 2, 2).toISOString() })
  })

  it("notes a change to the plan, and forgets it once undone", async () => {
    await seed()
    await check(at(10))
    await db.execute("UPDATE chapters SET title = 'Landing' WHERE id = 'ch-Arrival'")
    await check(at(11))
    expect((await readRecord(db, "book"))?.changedAt).toBe(iso(11))
    // A later check doesn't move the change on.
    await check(at(12))
    expect((await readRecord(db, "book"))?.changedAt).toBe(iso(11))
    await db.execute("UPDATE chapters SET title = 'Arrival' WHERE id = 'ch-Arrival'")
    await check(at(13))
    expect((await readRecord(db, "book"))?.changedAt).toBeNull()
  })

  it("dates a change by the writing behind it", async () => {
    await seed()
    await check(at(10, 9))
    await db.execute("UPDATE snapshots SET state_b64 = ? WHERE id = 'prose-sc-Arrival-1'", [
      bytesToBase64(blocksState(paras("The ferry docked at last."))),
    ])
    await wrote("2025-03-10", 2)
    await check(at(12))
    expect((await readRecord(db, "book"))?.changedAt).toBe(iso(10, 9))
  })

  it("only writes the record when there's something new in it", async () => {
    await seed()
    await check(at(10))
    const writes = vi.spyOn(db, "writeTransaction")
    await check(at(11))
    expect(writes).not.toHaveBeenCalled()
  })

  it("doesn't count another book's changes", async () => {
    await seed()
    await buildBook(db, { chapters: [{ title: "Elsewhere", scenes: [{}] }] }, "other")
    await check(at(10))
    await db.execute("UPDATE chapters SET title = 'Away' WHERE id = 'ch-Elsewhere'")
    await check(at(11))
    expect((await readRecord(db, "book"))?.changedAt).toBeNull()
  })
})

describe("takeBackup", () => {
  it("makes the backup, and notes it as made", async () => {
    await seed()
    await wrote("2025-03-10", 40)
    const file = await takeBackup(db, "book", reader(), at(10))
    expect(file.name).toBe("Test book 2025-03-10.bookbookbook.zip")
    const checked = await check(at(11))
    expect(checked.record).toEqual({ last: iso(10), hash: checked.hash, hashedAt: iso(10), dayWords: 40, changedAt: null })
  })

  it("is undone by more writing", async () => {
    await seed()
    await takeBackup(db, "book", reader(), at(10))
    await db.execute("UPDATE scenes SET title = 'Quay' WHERE id = 'sc-Arrival-1'")
    expect((await check(at(11))).record.changedAt).toBe(iso(11))
  })
})

describe("recordRestored", () => {
  it("dates a restored book's backup from when the backup was made", async () => {
    await seed()
    await wrote("2025-03-01", 40)
    const file = await takeBackup(db, "book", reader(), at(1))
    const restored = await restoreBackup(db, file.data as Uint8Array, at(20))
    await recordRestored(db, restored.bookId, restored.exportedAt, reader(), at(20))
    expect(await readRecord(db, restored.bookId)).toMatchObject({ last: iso(1), hashedAt: iso(20), changedAt: null })
    // Nothing has changed since.
    const checked = await check(at(21), restored.bookId)
    expect(checked.record.changedAt).toBeNull()
    expect(checked.record.hash).toBe((await readRecord(db, restored.bookId))?.hash)
    // And the record is the restored book's alone.
    expect(await db.getAll("SELECT id FROM ui_prefs ORDER BY id")).toEqual(
      [{ id: recordKey("book") }, { id: recordKey(restored.bookId) }].sort((a, b) => a.id.localeCompare(b.id)),
    )
  })

  it("dates it now when the backup doesn't say", async () => {
    await seed()
    await recordRestored(db, "book", null, reader(), at(20))
    expect(await readRecord(db, "book")).toMatchObject({ last: iso(20), changedAt: null })
  })
})
