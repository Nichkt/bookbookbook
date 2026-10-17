import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertRow, type Db } from "@/db/tx"
import { saveVersion } from "@/db/versions"
import { buildBook, outline } from "@/test/book"
import { para, paras, sceneBreak, text, writeProse } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import { base64ToBytes } from "@/yjs/base64"
import { docFromState } from "@/yjs/versions"
import { backupFile, BACKUP_FORMAT, NEWER_BACKUP, NOT_A_BACKUP, restoreBackup } from "./backup"
import { blocksState, docBlocks, tidyBlocks, type Block } from "./blocks"
import { storedSceneReader } from "./scenes"

let db: ReturnType<typeof createTestDb>
const NOW = new Date(2025, 2, 1, 12)

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

async function proseOf(target: Db, sceneId: string): Promise<Block[]> {
  const doc = docFromState(await storedSceneReader(target)(sceneId))
  try {
    return tidyBlocks(docBlocks(doc))
  } finally {
    doc.destroy()
  }
}

function blocksOfState(b64: string): Block[] {
  const doc = docFromState(base64ToBytes(b64))
  try {
    return tidyBlocks(docBlocks(doc))
  } finally {
    doc.destroy()
  }
}

let versionId: string

/** A book with a bit of everything, beside another book that mustn't come along. */
async function seed() {
  await buildBook(db, {
    acts: [
      {
        title: "I",
        chapters: [
          {
            title: "Arrival",
            pov: "mara",
            location: "harbor",
            labels: ["draft"],
            beats: ["Ferry docks"],
            threads: ["ledger"],
            present: ["mara"],
            scenes: [{ title: "Dock", pov: "mara" }, { title: "Inn" }, { title: "Cut", deleted: true }],
          },
          { title: "Binned", deleted: true, scenes: [{ title: "Old" }] },
        ],
      },
    ],
  })
  await buildBook(db, { chapters: [{ title: "Other", scenes: [{}] }] }, "other")
  await db.execute("UPDATE books SET author = 'Ann Lee', genre = 'Mystery', target_words = 90000 WHERE id = 'book'")

  for (const [id, key, name] of [
    ["type-character", "character", "Character"],
    ["type-place", "place", "Place"],
    ["type-thread", "thread", "Plot thread"],
  ]) {
    await insertRow(db, "codex_types", { id, universe_id: "universe", key, name, icon: "", field_schema: "[]", builtin: 1 })
  }
  for (const [id, type, name, extra] of [
    ["mara", "type-character", "Mara", { fields: '{"Age":"34"}', image_path: "images/mara.png" }],
    ["harbor", "type-place", "Grayhaven Harbor", {}],
    ["ledger", "type-thread", "The ledger", {}],
  ] as const) {
    await insertRow(db, "codex_entries", { id, universe_id: "universe", type_id: type, name, ...extra })
  }
  await insertRow(db, "beats", {
    id: "beat-scene",
    parent_kind: "scene",
    parent_id: "sc-Arrival-1",
    position: "a0",
    text: "Mara sees the ledger",
    done: 1,
  })
  const link = { book_id: "book", chapter_id: "ch-Arrival", role: "present", source: "auto" }
  await insertRow(db, "entity_links", { ...link, id: "link-scene", scene_id: "sc-Arrival-1", entry_id: "mara" })
  await insertRow(db, "entity_links", { ...link, id: "link-ghost", scene_id: null, entry_id: "ghost" })

  await writeProse(db, "sc-Arrival-1", [para(text("The ferry "), text("docked", "italic"), text(".")), sceneBreak, ...paras("Mara stepped off.")])
  await writeProse(db, "sc-Arrival-3", paras("Trashed words."))
  await writeProse(db, "sc-Binned-1", paras("Old words."))
  await writeProse(db, "sc-Other-1", paras("Another book."))

  const draft = docFromState(blocksState(paras("The ferry came.")))
  versionId = (await saveVersion(db, "sc-Arrival-1", draft, { kind: "manual", label: " First try ", now: new Date(2025, 1, 1) }))!
  draft.destroy()
  // Automatic versions aren't backed up.
  const later = docFromState(blocksState(paras("The ferry came late.")))
  expect(await saveVersion(db, "sc-Arrival-1", later, { kind: "auto", now: new Date(2025, 1, 2) })).not.toBe(versionId)
  later.destroy()

  await insertRow(db, "writing_stats", {
    id: "dev1:book:2025-02-28",
    book_id: "book",
    date: "2025-02-28",
    words_added: 500,
    words_removed: 20,
    ai_words_inserted: 0,
    dictated_words: 0,
    sprints: 1,
  })
}

const backup = async () => (await backupFile(db, "book", storedSceneReader(db), NOW)).data as Uint8Array

/** The book's rows with ids swapped for what they point to, so an original and its restore compare equal. */
async function shape(target: Db, bookId: string) {
  const { universe_id: universeId } = await target.get<{ universe_id: string }>(
    "SELECT universe_id FROM books WHERE id = ?",
    [bookId],
  )
  const inBook = "SELECT id FROM chapters WHERE book_id = ?"
  return {
    universe: await target.getAll("SELECT name, owner_id FROM universes WHERE id = ?", [universeId]),
    codex: await target.getAll(
      `SELECT t.key, t.name AS type, t.builtin, e.name, e.fields FROM codex_entries e
       JOIN codex_types t ON t.id = e.type_id AND t.universe_id = e.universe_id
       WHERE e.universe_id = ? ORDER BY e.name`,
      [universeId],
    ),
    chapters: await target.getAll(
      `SELECT c.title, c.position, c.status, c.labels, c.word_target, c.deleted_at, a.title AS act,
              pov.name AS pov, location.name AS location
       FROM chapters c
       LEFT JOIN acts a ON a.id = c.act_id AND a.book_id = c.book_id
       LEFT JOIN codex_entries pov ON pov.id = c.pov_entry_id AND pov.universe_id = ?
       LEFT JOIN codex_entries location ON location.id = c.location_entry_id AND location.universe_id = ?
       WHERE c.book_id = ? ORDER BY c.position`,
      [universeId, universeId, bookId],
    ),
    scenes: await target.getAll(
      `SELECT c.title AS chapter, s.title, s.position, s.deleted_at, s.is_implicit, pov.name AS pov
       FROM scenes s JOIN chapters c ON c.id = s.chapter_id
       LEFT JOIN codex_entries pov ON pov.id = s.pov_entry_id AND pov.universe_id = ?
       WHERE c.book_id = ? ORDER BY c.position, s.position`,
      [universeId, bookId],
    ),
    beats: await target.getAll(
      `SELECT b.parent_kind, coalesce(c.title, s.title) AS parent, b.text, b.done FROM beats b
       LEFT JOIN chapters c ON b.parent_kind = 'chapter' AND c.id = b.parent_id AND c.book_id = ?
       LEFT JOIN scenes s ON b.parent_kind = 'scene' AND s.id = b.parent_id AND s.chapter_id IN (${inBook})
       WHERE c.id IS NOT NULL OR s.id IS NOT NULL ORDER BY b.text`,
      [bookId, bookId],
    ),
    links: await target.getAll(
      `SELECT l.role, l.source, e.name AS entry, c.title AS chapter, s.title AS scene FROM entity_links l
       JOIN codex_entries e ON e.id = l.entry_id AND e.universe_id = ?
       LEFT JOIN chapters c ON c.id = l.chapter_id AND c.book_id = l.book_id
       LEFT JOIN scenes s ON s.id = l.scene_id AND s.chapter_id = c.id
       WHERE l.book_id = ? ORDER BY e.name, l.role, l.source`,
      [universeId, bookId],
    ),
    versions: await target.getAll(
      `SELECT s.title AS scene, v.label, v.kind, v.word_count, v.created_at FROM snapshots v
       JOIN scenes s ON s.id = v.scene_id WHERE v.kind = 'manual' AND s.chapter_id IN (${inBook})`,
      [bookId],
    ),
    stats: await target.getAll(
      "SELECT date, words_added, words_removed, sprints FROM writing_stats WHERE book_id = ? ORDER BY date",
      [bookId],
    ),
  }
}

/** Every scene's prose, by chapter and scene title. */
async function proseByTitle(target: Db, bookId: string) {
  const scenes = await target.getAll<{ id: string; chapter: string; title: string }>(
    "SELECT s.id, c.title AS chapter, s.title FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ?",
    [bookId],
  )
  const prose: Record<string, Block[]> = {}
  for (const scene of scenes) prose[`${scene.chapter}/${scene.title}`] = await proseOf(target, scene.id)
  return prose
}

describe("backupFile", () => {
  it("packs the book's rows, prose and versions", async () => {
    await seed()
    const file = await backupFile(db, "book", storedSceneReader(db), NOW)
    expect([file.name, file.type]).toEqual(["Test book 2025-03-01.bookbookbook.zip", "application/zip"])

    const files = unzipSync(file.data as Uint8Array)
    expect(Object.keys(files).sort()).toEqual([
      "book.json",
      "manuscript.md",
      "scenes/sc-Arrival-1.md",
      "scenes/sc-Arrival-1.ystate",
      "scenes/sc-Arrival-3.md",
      "scenes/sc-Arrival-3.ystate",
      "scenes/sc-Binned-1.md",
      "scenes/sc-Binned-1.ystate",
      `versions/${versionId}.ystate`,
    ])

    const data = JSON.parse(strFromU8(files["book.json"]))
    expect(data).toMatchObject({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: NOW.toISOString(),
      book: { id: "book", author: "Ann Lee", target_words: 90000 },
      universe: { id: "universe", name: "Test" },
    })
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id)
    expect(ids(data.acts)).toEqual(["act-I"])
    expect(ids(data.chapters)).toEqual(["ch-Arrival", "ch-Binned"])
    expect(ids(data.scenes)).toEqual(["sc-Arrival-1", "sc-Arrival-2", "sc-Arrival-3", "sc-Binned-1"])
    expect(ids(data.beats).sort()).toEqual(["beat-Arrival-1", "beat-scene"])
    expect(ids(data.codexTypes)).toEqual(["type-character", "type-place", "type-thread"])
    expect(ids(data.codexEntries)).toEqual(["harbor", "ledger", "mara"])
    expect(ids(data.entityLinks)).toEqual([
      "link-Arrival-present-mara",
      "link-Arrival-thread-ledger",
      "link-ghost",
      "link-scene",
    ])
    expect(ids(data.writingStats)).toEqual(["dev1:book:2025-02-28"])
    expect(data.versions).toEqual([
      {
        id: versionId,
        scene_id: "sc-Arrival-1",
        kind: "manual",
        label: "First try",
        word_count: 3,
        created_at: new Date(2025, 1, 1).toISOString(),
      },
    ])

    expect(strFromU8(files["scenes/sc-Arrival-1.md"])).toBe(
      '---\nid: "sc-Arrival-1"\nchapter: "Arrival"\ntitle: "Dock"\n---\n\nThe ferry *docked*.\n\n* * *\n\nMara stepped off.\n',
    )
    expect(strFromU8(files["manuscript.md"])).toBe(
      "# Test book\n\nby Ann Lee\n\n## Chapter 1: Arrival\n\nThe ferry *docked*.\n\n* * *\n\nMara stepped off.\n",
    )
  })

  it("fails for a missing book", async () => {
    await expect(backupFile(db, "nope", storedSceneReader(db))).rejects.toThrow()
  })

  it("leaves out a version it can't read, rather than fail", async () => {
    await seed()
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await insertRow(db, "snapshots", {
      id: "unreadable",
      scene_id: "sc-Arrival-1",
      state_b64: "%%%",
      word_count: 1,
      label: "Broken",
      kind: "manual",
      created_at: new Date(2025, 1, 3).toISOString(),
    })
    const files = unzipSync(await backup())
    expect(JSON.parse(strFromU8(files["book.json"])).versions.map((version: { id: string }) => version.id)).toEqual([
      versionId,
    ])
    expect(Object.keys(files).filter((name) => name.startsWith("versions/"))).toEqual([`versions/${versionId}.ystate`])
    expect(errors).toHaveBeenCalledOnce()
    errors.mockRestore()
  })
})

const concat = (...parts: Uint8Array[]) => {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  parts.reduce((at, part) => (joined.set(part, at), at + part.length), 0)
  return joined
}

/** A zip's central directory: where each file's record starts and ends, and the file's name. */
function directory(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const records: { start: number; end: number; name: string }[] = []
  for (let i = 0, at = view.getUint32(end + 16, true); i < view.getUint16(end + 10, true); i++) {
    const nameLength = view.getUint16(at + 28, true)
    const next = at + 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
    records.push({ start: at, end: next, name: strFromU8(zip.subarray(at + 46, at + 46 + nameLength)) })
    at = next
  }
  return { view, end, records }
}

/** The zip, listing `name` again under each of `aliases` (each as long as it), all pointing at its one copy of data. */
function withAliases(zip: Uint8Array, name: string, aliases: string[]): Uint8Array {
  const { end, records } = directory(zip)
  const record = records.find((candidate) => candidate.name === name)!
  const copies = aliases.map((alias) => {
    expect(alias.length).toBe(name.length)
    const copy = zip.slice(record.start, record.end)
    copy.set(strToU8(alias), 46)
    return copy
  })
  const eocd = zip.slice(end)
  const view = new DataView(eocd.buffer)
  view.setUint16(8, records.length + aliases.length, true)
  view.setUint16(10, records.length + aliases.length, true)
  view.setUint32(12, view.getUint32(12, true) + aliases.length * (record.end - record.start), true)
  return concat(zip.subarray(0, end), ...copies, eocd)
}

/** The zip, with the directory claiming `name` unpacks to `size` bytes. */
function withClaimedSize(zip: Uint8Array, name: string, size: number): Uint8Array {
  const copy = zip.slice()
  const { view, records } = directory(copy)
  view.setUint32(records.find((record) => record.name === name)!.start + 24, size, true)
  return copy
}

describe("restoreBackup", () => {
  it("restores a backup as a new book beside the original", async () => {
    await seed()
    const zip = await backup()
    const { bookId, title } = await restoreBackup(db, zip, NOW)
    expect(title).toBe("Test book (restored)")
    expect(bookId).not.toBe("book")

    const book = await db.get<Record<string, unknown>>("SELECT * FROM books WHERE id = ?", [bookId])
    expect(book).toMatchObject({
      title: "Test book (restored)",
      author: "Ann Lee",
      genre: "Mystery",
      target_words: 90000,
      owner_id: null,
      created_at: NOW.toISOString(),
      deleted_at: null,
    })
    expect(book.universe_id).not.toBe("universe")

    expect(await outline(db, bookId)).toEqual(await outline(db, "book"))
    const original = await shape(db, "book")
    const restored = await shape(db, bookId)
    expect(restored).toEqual(original)
    // Every link but the one to a codex entry that doesn't exist.
    expect(restored.links).toHaveLength(3)
    expect(await db.getAll("SELECT id FROM entity_links WHERE book_id = ?", [bookId])).toHaveLength(3)
    // Pictures stay behind.
    expect(await db.getAll("SELECT image_path FROM codex_entries WHERE image_path IS NOT NULL")).toHaveLength(1)

    expect(await proseByTitle(db, bookId)).toEqual(await proseByTitle(db, "book"))
    const counts = await db.getAll(
      "SELECT s.title, s.word_count FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ? ORDER BY s.title",
      [bookId],
    )
    expect(counts).toEqual([
      { title: "Cut", word_count: 2 },
      { title: "Dock", word_count: 6 },
      { title: "Inn", word_count: 0 },
      { title: "Old", word_count: 2 },
    ])

    const [version] = await db.getAll<{ state_b64: string }>(
      `SELECT state_b64 FROM snapshots WHERE kind = 'manual'
       AND scene_id IN (SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ?)`,
      [bookId],
    )
    expect(blocksOfState(version.state_b64)).toEqual(paras("The ferry came."))
    expect(await db.getAll("SELECT id FROM writing_stats WHERE book_id = ?", [bookId])).toEqual([
      { id: `dev1:${bookId}:2025-02-28` },
    ])
  })

  it("names each restore apart, and keeps the title in a library without it", async () => {
    await seed()
    const zip = await backup()
    expect((await restoreBackup(db, zip, NOW)).title).toBe("Test book (restored)")
    expect((await restoreBackup(db, zip, NOW)).title).toBe("Test book (restored 2)")

    const elsewhere = createTestDb()
    try {
      const { bookId, title } = await restoreBackup(elsewhere, zip, NOW)
      expect(title).toBe("Test book")
      expect(await shape(elsewhere, bookId)).toEqual(await shape(db, "book"))
      expect(await proseByTitle(elsewhere, bookId)).toEqual(await proseByTitle(db, "book"))
    } finally {
      elsewhere.close()
    }
  })

  it("restores prose from Markdown, and leaves out what it can't place", async () => {
    const book = {
      format: BACKUP_FORMAT,
      version: 1,
      book: { id: "b1", title: "  Hand made ", target_words: "5000", unknown: "ignored" },
      universe: null,
      chapters: [{ id: "c1", book_id: "b1", title: "One", position: "a0", act_id: "missing" }],
      scenes: [
        { id: "s1", chapter_id: "c1", position: "a0", title: "First", word_count: 999 },
        { id: "s2", chapter_id: "missing", position: "a1", title: "Orphan" },
        { id: "s1", chapter_id: "c1", position: "a2", title: "Repeated" },
        { chapter_id: "c1", position: "a3", title: "No id" },
      ],
      beats: [
        { id: "x1", parent_kind: "scene", parent_id: "s2", position: "a0", text: "Orphan's beat" },
        { id: "x2", parent_kind: "scene", parent_id: "s1", position: "a0", text: "Kept" },
        { id: "x3", parent_kind: "act", parent_id: "c1", position: "a1", text: "Odd kind" },
      ],
      versions: [{ id: "v1", scene_id: "s2", kind: "manual", label: "Orphan's version" }],
      writingStats: [{ id: "d:b1:2025-01-01", date: "2025-01-01", words_added: "12" }, { id: "no-date" }],
    }
    const zip = zipSync({
      "book.json": strToU8(JSON.stringify(book)),
      "scenes/s1.md": strToU8('---\nid: "s1"\ntitle: "First"\n---\n\nHello *there*.\n\n* * *\n\nAgain.\n'),
      "scenes/s2.md": strToU8("Lost."),
      "versions/v1.ystate": blocksState(paras("Lost too.")),
      "notes.txt": strToU8("Not part of a backup."),
    })

    const { bookId, title } = await restoreBackup(db, zip, NOW)
    expect(title).toBe("Hand made")
    expect(await outline(db, bookId)).toEqual(["One: First"])
    const row = await db.get<{ target_words: number; universe_id: string }>("SELECT * FROM books WHERE id = ?", [bookId])
    expect(row.target_words).toBe(5000)
    expect(await db.getAll("SELECT name FROM universes WHERE id = ?", [row.universe_id])).toEqual([{ name: "Hand made" }])

    const [scene] = await db.getAll<{ id: string; word_count: number }>(
      "SELECT s.id, s.word_count FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE c.book_id = ?",
      [bookId],
    )
    expect(await proseOf(db, scene.id)).toEqual([
      para(text("Hello "), text("there", "italic"), text(".")),
      sceneBreak,
      ...paras("Again."),
    ])
    expect(scene.word_count).toBe(3)
    expect(await db.getAll("SELECT text FROM beats")).toEqual([{ text: "Kept" }])
    expect(await db.getAll("SELECT id FROM snapshots WHERE kind = 'manual'")).toEqual([])
    expect(await db.getAll("SELECT id, words_added FROM writing_stats")).toEqual([
      { id: `d:${bookId}:2025-01-01`, words_added: 12 },
    ])
  })

  it("refuses what isn't a backup, and changes nothing", async () => {
    const zipOf = (json: unknown) => zipSync({ "book.json": strToU8(JSON.stringify(json)) })
    await expect(restoreBackup(db, strToU8("not a zip"))).rejects.toThrow(NOT_A_BACKUP)
    await expect(restoreBackup(db, zipSync({ "other.txt": strToU8("hi") }))).rejects.toThrow(NOT_A_BACKUP)
    await expect(restoreBackup(db, zipSync({ "book.json": strToU8("{") }))).rejects.toThrow(NOT_A_BACKUP)
    await expect(restoreBackup(db, zipOf({ format: "other", version: 1, book: {} }))).rejects.toThrow(NOT_A_BACKUP)
    await expect(restoreBackup(db, zipOf({ format: BACKUP_FORMAT, version: 1, book: [] }))).rejects.toThrow(NOT_A_BACKUP)
    await expect(restoreBackup(db, zipOf({ format: BACKUP_FORMAT, version: 2, book: {} }))).rejects.toThrow(NEWER_BACKUP)
    expect(await db.getAll("SELECT id FROM books")).toEqual([])
    expect(await db.getAll("SELECT id FROM universes")).toEqual([])
  })

  it("restores a zip of stored files, as other zip tools may make", async () => {
    await seed()
    const stored = zipSync(unzipSync(await backup()), { level: 0 })
    const { bookId } = await restoreBackup(db, stored, NOW)
    expect(await shape(db, bookId)).toEqual(await shape(db, "book"))
    expect(await proseByTitle(db, bookId)).toEqual(await proseByTitle(db, "book"))
  })

  it("refuses a zip whose files share data or misstate their size, and changes nothing", async () => {
    const json = strToU8(JSON.stringify({ format: BACKUP_FORMAT, version: 1, book: { title: "Bomb" } }))
    // Words that don't repeat much, so the file stays big when deflated.
    const words = Array.from({ length: 3000 }, (_, i) => `w${(i * 7919) % 10007}`).join(" ")
    const prose = strToU8(`---\nid: "a"\n---\n\n${words}\n`)
    const name = "scenes/a.md"
    for (const level of [0, 6] as const) {
      const zip = zipSync({ "book.json": json, [name]: prose }, { level })
      // Untouched, it restores.
      expect((await restoreBackup(db, zip, NOW)).title).toMatch(/^Bomb/)
      const aliases = Array.from({ length: 40 }, (_, i) => `scenes/${String.fromCharCode(98 + (i % 25))}.md`)
      await expect(restoreBackup(db, withAliases(zip, name, aliases))).rejects.toThrow(NOT_A_BACKUP)
    }
    const stored = zipSync({ "book.json": json, [name]: prose }, { level: 0 })
    await expect(restoreBackup(db, withClaimedSize(stored, name, 0))).rejects.toThrow(NOT_A_BACKUP)
    expect(await db.getAll("SELECT title FROM books ORDER BY title")).toEqual([{ title: "Bomb" }, { title: "Bomb (restored)" }])
  })

  it("names an untitled book", async () => {
    const zip = zipSync({ "book.json": strToU8(JSON.stringify({ format: BACKUP_FORMAT, version: 1, book: {} })) })
    expect((await restoreBackup(db, zip, NOW)).title).toBe("Untitled book")
  })
})
