import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type * as Y from "yjs"
import { buildBook } from "@/test/book"
import { createTestDb } from "@/test/sqliteDb"
import { docFromState } from "@/yjs/versions"
import { proseState, proseText } from "@/yjs/prose"
import {
  AUTO_VERSIONS_KEPT,
  BEFORE_RESTORE_LABEL,
  loadVersion,
  restoreVersion,
  saveVersion,
  VERSIONS_SQL,
  type VersionRow,
} from "./versions"

const SCENE = "sc-One-1"
let db: ReturnType<typeof createTestDb>
const docs: Y.Doc[] = []

const prose = (...paragraphs: string[]) => {
  const doc = docFromState(proseState(paragraphs))
  docs.push(doc)
  return doc
}
const versions = () => db.getAll<VersionRow>(VERSIONS_SQL, [SCENE])
const at = (minute: number) => new Date(Date.UTC(2025, 2, 1, 9, minute))

async function textOf(versionId: string | null) {
  const doc = versionId ? await loadVersion(db, versionId) : null
  if (!doc) return null
  docs.push(doc)
  return proseText(doc)
}

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "One", scenes: [{ title: "A", written: true }] }] })
})

afterEach(() => {
  for (const doc of docs.splice(0)) doc.destroy()
  db.close()
})

describe("saveVersion", () => {
  test("lists versions newest first, with their words and labels, and not the storage rows", async () => {
    await saveVersion(db, SCENE, prose("The ferry left at dawn."), { kind: "auto", now: at(0) })
    await saveVersion(db, SCENE, prose("The ferry left at noon, late."), { kind: "manual", label: " Noon ", now: at(5) })
    expect((await versions()).map(({ kind, label, word_count }) => [kind, label, word_count])).toEqual([
      ["manual", "Noon", 6],
      ["auto", "", 5],
    ])
    expect(await db.getAll("SELECT id FROM snapshots WHERE kind = 'compaction'")).toHaveLength(1)
  })

  test("an automatic version that repeats the latest one isn't saved, and its id comes back", async () => {
    const first = await saveVersion(db, SCENE, prose("Same words."), { kind: "manual", now: at(0) })
    expect(await saveVersion(db, SCENE, prose("Same words."), { kind: "auto", now: at(1) })).toBe(first)
    const changed = await saveVersion(db, SCENE, prose("Other words."), { kind: "auto", now: at(2) })
    expect(changed).not.toBe(first)
    // Taken by hand, a version is always saved.
    await saveVersion(db, SCENE, prose("Other words."), { kind: "manual", now: at(3) })
    expect(await versions()).toHaveLength(3)
  })

  test("an empty scene's first automatic version is skipped, but not one taken by hand", async () => {
    expect(await saveVersion(db, SCENE, prose(""), { kind: "auto" })).toBeNull()
    expect(await versions()).toEqual([])
    expect(await saveVersion(db, SCENE, prose(""), { kind: "manual" })).toEqual(expect.any(String))
  })

  test(`keeps the newest ${AUTO_VERSIONS_KEPT} automatic versions and every named one`, async () => {
    await saveVersion(db, SCENE, prose("Named."), { kind: "manual", now: at(0) })
    for (let i = 1; i <= AUTO_VERSIONS_KEPT + 3; i++) {
      await saveVersion(db, SCENE, prose(`Draft ${i}.`), { kind: "auto", now: at(i) })
    }
    const kept = await versions()
    expect(kept.filter((row) => row.kind === "auto")).toHaveLength(AUTO_VERSIONS_KEPT)
    expect(kept.filter((row) => row.kind === "manual")).toHaveLength(1)
    expect(await textOf(kept.at(-2)!.id)).toBe("Draft 4.")
    expect(await db.getAll("SELECT id FROM snapshots WHERE kind = 'compaction'")).toHaveLength(1)
  })
})

describe("restoreVersion", () => {
  test("puts the version back after saving what it replaces, which restores the same way", async () => {
    const older = await saveVersion(db, SCENE, prose("First draft.", "Two lines."), { kind: "auto", now: at(0) })
    const live = prose("Second draft.")
    const before = await restoreVersion(db, SCENE, live, older!, "restore")
    expect(proseText(live)).toBe("First draft.\nTwo lines.")
    const saved = (await versions()).find((row) => row.id === before)
    expect(saved?.label).toBe(BEFORE_RESTORE_LABEL)
    expect(await textOf(before)).toBe("Second draft.")

    await restoreVersion(db, SCENE, live, before!, "undo")
    expect(proseText(live)).toBe("Second draft.")
  })

  test("does nothing when the version is gone", async () => {
    const live = prose("Words.")
    expect(await restoreVersion(db, SCENE, live, "gone", "restore")).toBeNull()
    expect(proseText(live)).toBe("Words.")
    expect(await versions()).toEqual([])
  })
})
