import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { ChangeSet } from "@/db/changes"
import { insertRow } from "@/db/tx"
import { plainToRichText, richTextToPlain } from "@/lib/richText"
import { buildBook, chapterRow } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import {
  appendText,
  buildInbox,
  filedPlace,
  filingText,
  INBOX_NOTES_SQL,
  momentsFrom,
  notePreview,
  noteWhen,
  parseFiledTo,
  worldIdea,
  type InboxNoteRow,
} from "./inboxData"
import {
  addNote,
  deleteNote,
  fileToChapter,
  fileToEntry,
  markMadeIntoEntry,
  unfileNote,
  updateNoteText,
} from "./mutations"

let db: ReturnType<typeof createTestDb>
beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, {
    chapters: [
      { title: "Harbor", notes: "Fog all day.", summary: "", beats: ["Mara lands"] },
      { title: "Gone", deleted: true },
    ],
  })
})
afterEach(() => db.close())

const undo = (changes: ChangeSet) => db.writeTransaction((tx) => changes.revert(tx))
const notes = () => db.getAll<InboxNoteRow>(INBOX_NOTES_SQL, ["book"])
const note = async (id: string) => (await notes()).find((row) => row.id === id)!
const moments = async (chapterId: string) =>
  (
    await db.getAll<{ text: string }>(
      "SELECT text FROM beats WHERE parent_kind = 'chapter' AND parent_id = ? ORDER BY position",
      [chapterId],
    )
  ).map((beat) => beat.text)

describe("notes", () => {
  test("addNote keeps a typed note's text, trimmed, with no engine; a dictated one names its engine", async () => {
    const typed = await addNote(db, { bookId: "book", text: "  A lighthouse with no keeper \n", sttEngine: "google" })
    const spoken = await addNote(db, {
      bookId: "book",
      text: "Salt in the ledger",
      source: "voice-live",
      sttEngine: "on-device",
    })
    expect(await note(typed)).toMatchObject({
      book_id: "book",
      text: "A lighthouse with no keeper",
      source: "typed",
      stt_engine: null,
      filed_to: null,
      created_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    })
    expect(await note(spoken)).toMatchObject({ source: "voice-live", stt_engine: "on-device" })
  })

  test("updateNoteText saves edits; deleteNote removes the note, and Undo brings it back", async () => {
    const id = await addNote(db, { bookId: "book", text: "Draft" })
    await updateNoteText(db, id, "Redrafted")
    const before = await note(id)
    expect(before.text).toBe("Redrafted")
    const changes = await deleteNote(db, id)
    expect(await notes()).toEqual([])
    await undo(changes)
    expect(await note(id)).toEqual(before)
  })
})

describe("filing", () => {
  test("into a chapter's notes or summary adds the text after a blank line, and Undo takes it back out", async () => {
    const id = await addNote(db, { bookId: "book", text: "The keeper drowned." })
    const changes = await fileToChapter(db, id, "ch-Harbor", "notes")
    expect((await chapterRow(db, "ch-Harbor")).notes).toBe("Fog all day.\n\nThe keeper drowned.")
    expect(parseFiledTo((await note(id)).filed_to)).toEqual({
      kind: "chapter",
      id: "ch-Harbor",
      as: "notes",
      at: expect.any(String),
    })
    await undo(changes)
    expect((await chapterRow(db, "ch-Harbor")).notes).toBe("Fog all day.")
    expect((await note(id)).filed_to).toBeNull()

    await fileToChapter(db, id, "ch-Harbor", "summary")
    expect((await chapterRow(db, "ch-Harbor")).summary).toBe("The keeper drowned.")
  })

  test("as moments adds one per line after the chapter's last, bullets dropped, and Undo removes them", async () => {
    const id = await addNote(db, { bookId: "book", text: "- Mara finds the ledger\n\n2. Jonas lies\n" })
    const changes = await fileToChapter(db, id, "ch-Harbor", "moments")
    expect(await moments("ch-Harbor")).toEqual(["Mara lands", "Mara finds the ledger", "Jonas lies"])
    await undo(changes)
    expect(await moments("ch-Harbor")).toEqual(["Mara lands"])
    expect((await note(id)).filed_to).toBeNull()
  })

  test("won't file into a chapter in the Trash, or a note that's gone, changing nothing", async () => {
    const id = await addNote(db, { bookId: "book", text: "Lost" })
    await expect(fileToChapter(db, id, "ch-Gone", "notes")).rejects.toThrow()
    await expect(fileToChapter(db, "nope", "ch-Harbor", "notes")).rejects.toThrow()
    expect((await note(id)).filed_to).toBeNull()
    expect((await chapterRow(db, "ch-Harbor")).notes).toBe("Fog all day.")
  })

  test("into a World entry adds a paragraph to its notes; Undo takes it out", async () => {
    await insertRow(db, "codex_entries", {
      id: "mara",
      universe_id: "universe",
      type_id: null,
      name: "Mara",
      notes: plainToRichText("Smuggler."),
      deleted_at: null,
    })
    const id = await addNote(db, { bookId: "book", text: "Afraid of deep water" })
    const changes = await fileToEntry(db, id, "mara")
    const entryNotes = async () =>
      richTextToPlain((await db.get<{ notes: string }>("SELECT notes FROM codex_entries WHERE id = 'mara'")).notes)
    expect(await entryNotes()).toBe("Smuggler.\n\nAfraid of deep water")
    expect(parseFiledTo((await note(id)).filed_to)).toMatchObject({ kind: "entry", id: "mara", as: "notes" })
    await undo(changes)
    expect(await entryNotes()).toBe("Smuggler.")
  })

  test("a note made into a new entry is filed as that; unfiling puts any note back to sort", async () => {
    const id = await addNote(db, { bookId: "book", text: "Captain Ilse" })
    await markMadeIntoEntry(db, id, "ilse")
    expect(parseFiledTo((await note(id)).filed_to)).toMatchObject({ kind: "entry", id: "ilse", as: "new" })
    const changes = await unfileNote(db, id)
    expect((await note(id)).filed_to).toBeNull()
    await undo(changes)
    expect(parseFiledTo((await note(id)).filed_to)).toMatchObject({ kind: "entry", id: "ilse" })
  })
})

describe("inbox data", () => {
  const row = (id: string, filedTo: string | null, createdAt: string): InboxNoteRow => ({
    id,
    book_id: "book",
    text: id,
    source: "typed",
    stt_engine: null,
    filed_to: filedTo,
    created_at: createdAt,
  })

  test("splits notes to sort, newest first as queried, from filed ones, the latest filed first", () => {
    const filed = (at: string) => JSON.stringify({ kind: "chapter", id: "c", as: "notes", at })
    const inbox = buildInbox([
      row("new", null, "2024-03-03"),
      row("filed-early", filed("2024-03-04"), "2024-03-02"),
      row("old", null, "2024-03-01"),
      row("filed-late", filed("2024-03-05"), "2024-01-01"),
    ])
    expect(inbox.toSort.map((note) => note.id)).toEqual(["new", "old"])
    expect(inbox.filed.map((note) => note.id)).toEqual(["filed-late", "filed-early"])
  })

  test("reads filed_to forgivingly: nonsense is a note to sort", () => {
    expect(parseFiledTo(null)).toBeNull()
    expect(parseFiledTo("{")).toBeNull()
    expect(parseFiledTo(JSON.stringify({ kind: "chapter" }))).toBeNull()
    expect(parseFiledTo(JSON.stringify({ kind: "shelf", id: "x" }))).toBeNull()
    expect(parseFiledTo(JSON.stringify({ kind: "chapter", id: "c", as: "poem" }))).toEqual({
      kind: "chapter",
      id: "c",
      as: "notes",
      at: "",
    })
  })

  test("text helpers", () => {
    expect(momentsFrom("* one\n• two\n  \n3) three\n10. ten\n— dash\nplain")).toEqual([
      "one",
      "two",
      "three",
      "ten",
      "dash",
      "plain",
    ])
    expect(appendText("", " New ")).toBe("New")
    expect(appendText("Old\n\n", "New")).toBe("Old\n\nNew")
    expect(appendText(null, "New")).toBe("New")
    expect(notePreview("  First line here\nsecond")).toBe("First line here")
    expect(notePreview("\n- Mara finds the ledger\n- She hides it")).toBe("Mara finds the ledger")
    expect(notePreview("x".repeat(80), 10)).toBe("xxxxxxxxx…")
  })

  test("says where a note was filed, or that it's gone", () => {
    const at = "2024-03-03"
    expect(filingText({ kind: "chapter", id: "c", as: "notes", at }, "Chapter 2: Gone")).toBe(
      "Added to the notes of Chapter 2: Gone.",
    )
    expect(filingText({ kind: "chapter", id: "c", as: "moments", at }, "Chapter 2: Gone")).toBe(
      "Added as moments to Chapter 2: Gone.",
    )
    expect(filingText({ kind: "chapter", id: "c", as: "summary", at }, null)).toBe(
      "Filed in a chapter that's since been deleted.",
    )
    expect(filingText({ kind: "entry", id: "e", as: "new", at }, "Ilse")).toBe("Made into “Ilse” in the World.")
    expect(filingText({ kind: "entry", id: "e", as: "notes", at }, "Ilse")).toBe(
      "Added to the notes of “Ilse” in the World.",
    )
  })

  test("names the chapter or entry a note went to, or null once it's deleted", () => {
    const places = {
      chapterById: new Map([
        ["c3", { number: 3, title: "The Ferry" }],
        ["c4", { number: 4, title: null }],
      ]),
      entryById: new Map([["e", { name: "Ilse" }]]),
    }
    expect(filedPlace({ kind: "chapter", id: "c3" }, places)).toBe("Chapter 3: The Ferry")
    expect(filedPlace({ kind: "chapter", id: "c4" }, places)).toBe("Chapter 4: Untitled chapter")
    expect(filedPlace({ kind: "entry", id: "e" }, places)).toBe("Ilse")
    expect(filedPlace({ kind: "chapter", id: "e" }, places)).toBeNull()
    expect(filedPlace({ kind: "entry", id: "gone" }, places)).toBeNull()
  })

  test("dates a note by the time today, Yesterday, else the day", () => {
    const now = new Date(2024, 2, 10, 15, 0)
    expect(noteWhen(new Date(2024, 2, 10, 9, 5).toISOString(), now, "en-US")).toMatch(/^9:05\sAM$/u)
    expect(noteWhen(new Date(2024, 2, 9, 23, 0).toISOString(), now, "en-US")).toBe("Yesterday")
    expect(noteWhen(new Date(2024, 1, 3).toISOString(), now, "en-US")).toBe("Feb 3")
    expect(noteWhen(new Date(2023, 1, 3).toISOString(), now, "en-US")).toBe("Feb 3, 2023")
    expect(noteWhen("", now)).toBe("")
  })

  test("a note's first line names a new World entry only if it's a name", () => {
    expect(worldIdea("Ilse Varga — the harbourmaster\nOwes Mara a favour")).toEqual({
      name: "Ilse Varga",
      notes: "the harbourmaster\nOwes Mara a favour",
    })
    expect(worldIdea("The Saltmarsh Inn\nA pub by the docks")).toEqual({
      name: "The Saltmarsh Inn",
      notes: "A pub by the docks",
    })
    expect(worldIdea("Order of the Grey Lantern: a secret society")).toEqual({
      name: "Order of the Grey Lantern",
      notes: "a secret society",
    })
    expect(worldIdea("  Mara's.  ")).toEqual({ name: "Mara", notes: "" })
    expect(worldIdea("Remember to fix the ferry scene")).toEqual({ name: "", notes: "Remember to fix the ferry scene" })
    expect(worldIdea("What if Ilse Lies?")).toEqual({ name: "", notes: "What if Ilse Lies?" })
  })
})
