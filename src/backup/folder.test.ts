import { strFromU8, unzipSync } from "fflate"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readPref } from "@/db/prefs"
import { storedSceneReader } from "@/export/scenes"
import { buildBook } from "@/test/book"
import { paras, writeProse } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import {
  afterPass,
  backUpBooks,
  filesKey,
  folderErrorOf,
  folderState,
  forgetFolderFiles,
  numbered,
  parseFolderPref,
  type BackupDir,
  type BackupWritable,
  type FolderPref,
} from "./folder"
import { readRecord, takeBackup } from "./state"

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

const at = (day: number, hour = 12) => new Date(2025, 2, day, hour)
const iso = (day: number, hour = 12) => at(day, hour).toISOString()
const zipName = (title: string, day: number, n = 1) => numbered(`${title} 2025-03-${String(day).padStart(2, "0")}.bookbookbook.zip`, n)

/** A folder in memory, as much of one as folder backups use. */
class FakeDir implements BackupDir {
  entries = new Map<string, Uint8Array | string | "folder">()
  failWrites: unknown = null
  aborted = 0
  /** As if the folder itself had been deleted. */
  gone = false

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (this.gone) throw new DOMException("The folder has gone", "NotFoundError")
    const entry = this.entries.get(name)
    if (entry === "folder") throw new DOMException(`${name} is a folder`, "TypeMismatchError")
    if (entry === undefined) {
      if (!options?.create) throw new DOMException(`No ${name}`, "NotFoundError")
      this.entries.set(name, "")
    }
    return {
      createWritable: async (): Promise<BackupWritable> => {
        let written: Uint8Array | string = ""
        return {
          write: async (data) => {
            if (this.failWrites) throw this.failWrites
            written = data
          },
          close: async () => {
            this.entries.set(name, written)
          },
          abort: async () => {
            this.aborted++
          },
        }
      },
    }
  }

  async removeEntry(name: string) {
    if (this.gone || !this.entries.delete(name)) throw new DOMException(`No ${name}`, "NotFoundError")
  }

  names = () => [...this.entries.keys()].sort()

  bookJson(name: string) {
    const data = this.entries.get(name)
    if (!(data instanceof Uint8Array)) throw new Error(`${name} isn't a backup`)
    return strFromU8(unzipSync(data)["book.json"])
  }
}

let dir: FakeDir

beforeEach(() => {
  dir = new FakeDir()
})

const pass = (now: Date) => backUpBooks(db, storedSceneReader(db), dir, now)

async function seed() {
  await buildBook(db, { chapters: [{ title: "Arrival", scenes: [{ title: "Dock" }] }] })
  await writeProse(db, "sc-Arrival-1", paras("The ferry docked."))
  await buildBook(db, { chapters: [{ title: "Elsewhere", scenes: [{}] }] }, "other")
  await db.execute("UPDATE books SET title = 'Other' WHERE id = 'other'")
}

let edits = 0
const edit = (bookId = "book") => db.execute("UPDATE books SET genre = ? WHERE id = ?", [`Genre ${++edits}`, bookId])

describe("backUpBooks", () => {
  it("writes each book's backup, named for it and the day, then only once it changes", async () => {
    await seed()
    expect(await pass(at(10))).toEqual({ wrote: ["book", "other"] })
    expect(dir.names()).toEqual([zipName("Other", 10), zipName("Test book", 10)])
    expect(JSON.parse(dir.bookJson(zipName("Test book", 10))).book).toMatchObject({ id: "book", title: "Test book" })
    expect(await readRecord(db, "book")).toMatchObject({ last: iso(10), changedAt: null })

    expect(await pass(at(10, 13))).toEqual({ wrote: [] })
    expect((await readRecord(db, "book"))?.last).toBe(iso(10))

    // The same day, the book's backup is replaced; the next, it gets another.
    await edit()
    expect(await pass(at(10, 14))).toEqual({ wrote: ["book"] })
    expect(dir.names()).toEqual([zipName("Other", 10), zipName("Test book", 10)])
    expect(dir.bookJson(zipName("Test book", 10))).toContain("Genre 1")
    await edit()
    expect(await pass(at(11))).toEqual({ wrote: ["book"] })
    expect(dir.names()).toEqual([zipName("Other", 10), zipName("Test book", 10), zipName("Test book", 11)])
    expect(await readRecord(db, "book")).toMatchObject({ last: iso(11), changedAt: null })
  })

  it("steps around anything by the same name it didn't write", async () => {
    await seed()
    dir.entries.set(zipName("Test book", 10), "someone else's")
    dir.entries.set(zipName("Test book", 10, 2), "folder")
    await pass(at(10))
    expect(dir.names()).toContain(zipName("Test book", 10, 3))
    await edit()
    await pass(at(10, 13))
    expect(dir.entries.get(zipName("Test book", 10))).toBe("someone else's")
    expect(dir.bookJson(zipName("Test book", 10, 3))).toContain("Genre")
    expect(dir.names().filter((name) => name.startsWith("Test book"))).toHaveLength(3)
  })

  it("gives books of the same name their own files", async () => {
    await seed()
    await db.execute("UPDATE books SET title = 'Test book' WHERE id = 'other'")
    await pass(at(10))
    expect(dir.names()).toEqual([zipName("Test book", 10, 2), zipName("Test book", 10)].sort())
    await edit("book")
    await edit("other")
    await pass(at(10, 13))
    expect(dir.names()).toHaveLength(2)
    expect(JSON.parse(dir.bookJson(zipName("Test book", 10))).book.id).toBe("book")
    expect(JSON.parse(dir.bookJson(zipName("Test book", 10, 2))).book.id).toBe("other")
  })

  it("keeps the newest ten backups of each book, and removes only its own", async () => {
    await seed()
    dir.entries.set(zipName("Test book", 1), "someone else's")
    for (let day = 2; day <= 13; day++) {
      await edit()
      await pass(at(day))
      // A backup the writer deleted by hand is no trouble.
      if (day === 3) dir.entries.delete(zipName("Test book", 3))
    }
    const books = dir.names().filter((name) => name.startsWith("Test book"))
    expect(books).toEqual([zipName("Test book", 1), ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((day) => zipName("Test book", day))])
    expect(JSON.parse((await readPref(db, filesKey("book")))!).files).toHaveLength(10)
  })

  it("leaves the Trash alone", async () => {
    await seed()
    await db.execute("UPDATE books SET deleted_at = ? WHERE id = 'other'", [iso(9)])
    expect(await pass(at(10))).toEqual({ wrote: ["book"] })
    expect(await readRecord(db, "other")).toBeNull()
  })

  it("stops writing at the first error, but still checks every book", async () => {
    await seed()
    const full = new DOMException("The disk is full.", "QuotaExceededError")
    dir.failWrites = full
    const result = await pass(at(10))
    expect(result).toEqual({ wrote: [], error: { cause: full } })
    // No empty file left where the backup should be.
    expect(dir.names()).toEqual([])
    expect(dir.aborted).toBe(1)
    expect(await readRecord(db, "book")).toMatchObject({ last: null })
    expect(await readRecord(db, "other")).toMatchObject({ last: null })

    dir.failWrites = null
    expect(await pass(at(10, 13))).toEqual({ wrote: ["book", "other"] })
  })

  it("carries on past a book it can't read", async () => {
    await seed()
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const read = storedSceneReader(db)
    const result = await backUpBooks(
      db,
      async (sceneId) => {
        if (sceneId === "sc-Arrival-1") throw new Error("unreadable")
        return read(sceneId)
      },
      dir,
      at(10),
    )
    expect(result).toEqual({ wrote: ["other"] })
    expect(error).toHaveBeenCalledOnce()
  })

  it("counts a book as backed up when the folder has it as it stands", async () => {
    await seed()
    await pass(at(10))
    // Downloaded with a change, which was then undone.
    await edit()
    await takeBackup(db, "book", storedSceneReader(db), at(11))
    await db.execute("UPDATE books SET genre = NULL WHERE id = 'book'")
    expect(await pass(at(12))).toEqual({ wrote: [] })
    expect(await readRecord(db, "book")).toMatchObject({ last: iso(12), changedAt: null })
  })

  it("writes a backup again once it's gone from the folder, though the book hasn't changed", async () => {
    await seed()
    await pass(at(10))
    await edit()
    await pass(at(11))
    // Emptied by hand, say, or deleted and made anew.
    dir.entries.delete(zipName("Test book", 11))
    expect(await pass(at(12))).toEqual({ wrote: ["book"] })
    expect(dir.names()).toEqual([zipName("Other", 10), zipName("Test book", 10), zipName("Test book", 12)])
    expect(await readRecord(db, "book")).toMatchObject({ last: iso(12), changedAt: null })

    dir.entries.clear()
    expect(await pass(at(12, 13))).toEqual({ wrote: ["book", "other"] })
    // Only the backups it still has are noted, to replace or prune.
    expect(JSON.parse((await readPref(db, filesKey("book")))!).files).toEqual([zipName("Test book", 12)])
  })

  it("notices the folder has gone, though no book has changed", async () => {
    await seed()
    await pass(at(10))
    dir.gone = true
    const result = await pass(at(11))
    expect(result.wrote).toEqual([])
    expect(folderErrorOf(result.error?.cause)).toEqual({ kind: "missing" })
  })

  it("only checks without a folder", async () => {
    await seed()
    expect(await backUpBooks(db, storedSceneReader(db), null, at(10))).toEqual({ wrote: [] })
    expect(await readRecord(db, "book")).toMatchObject({ last: null, changedAt: null })
  })

  it("starts afresh in a new folder", async () => {
    await seed()
    await pass(at(10))
    await forgetFolderFiles(db)
    expect(await readPref(db, filesKey("book"))).toBeNull()
    dir = new FakeDir()
    expect(await pass(at(10, 13))).toEqual({ wrote: ["book", "other"] })
  })
})

describe("the folder's state", () => {
  const pref: FolderPref = { name: "Backups", lastRun: null, error: null }

  it("reads the note, and nothing else", () => {
    expect(parseFolderPref(JSON.stringify(pref))).toEqual(pref)
    const noted = { name: "B", lastRun: iso(3), error: { kind: "failed", message: "Full" } }
    expect(parseFolderPref(JSON.stringify(noted))).toEqual(noted)
    expect(parseFolderPref(JSON.stringify({ name: "B", lastRun: "soon", error: { kind: "odd" } }))).toEqual({
      name: "B",
      lastRun: null,
      error: null,
    })
    for (const junk of [null, "", "{", "[]", JSON.stringify({ lastRun: iso(3) })]) expect(parseFolderPref(junk)).toBeNull()
  })

  it("is off without a folder, stopped without its handle or after an error, and paused without permission", () => {
    expect(folderState(null, false, null)).toBe("off")
    expect(folderState(pref, false, null)).toBe("stopped")
    expect(folderState({ ...pref, error: { kind: "missing" } }, true, "granted")).toBe("stopped")
    expect(folderState(pref, true, "prompt")).toBe("paused")
    expect(folderState(pref, true, "denied")).toBe("paused")
    expect(folderState(pref, true, "granted")).toBe("on")
  })

  it("notes how a pass went", () => {
    const failed = { ...pref, error: { kind: "missing" as const } }
    expect(afterPass(failed, undefined, at(10))).toEqual({ ...pref, lastRun: iso(10) })
    expect(afterPass(pref, { cause: new DOMException("Gone", "NotFoundError") }, at(10))).toEqual(failed)
    expect(afterPass(pref, { cause: new DOMException("Full", "QuotaExceededError") }, at(10))).toEqual({
      ...pref,
      error: { kind: "failed", message: "Full" },
    })
    // Permission withdrawn pauses backups, which the permission itself shows.
    expect(afterPass(pref, { cause: new DOMException("No", "NotAllowedError") }, at(10))).toBe(pref)
    expect(folderErrorOf("odd")).toEqual({ kind: "failed", message: "odd" })
  })

  it("numbers a name before its extension", () => {
    expect(numbered("Book 2025-03-01.bookbookbook.zip", 1)).toBe("Book 2025-03-01.bookbookbook.zip")
    expect(numbered("Book 2025-03-01.bookbookbook.zip", 2)).toBe("Book 2025-03-01 (2).bookbookbook.zip")
    expect(numbered("Book", 3)).toBe("Book (3)")
  })
})
