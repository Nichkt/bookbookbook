import * as Y from "yjs"
import { afterEach, beforeEach, expect, it } from "vitest"
import { insertRow } from "@/db/tx"
import { buildBook } from "@/test/book"
import { paras, writeProse } from "@/test/blocks"
import { createTestDb } from "@/test/sqliteDb"
import { bytesToBase64 } from "@/yjs/base64"
import { PROSE_FIELD } from "@/yjs/prose"
import { docFromState } from "@/yjs/versions"
import { blocksState, docBlocks, tidyBlocks } from "./blocks"
import { storedSceneReader } from "./scenes"

let db: ReturnType<typeof createTestDb>

beforeEach(async () => {
  db = createTestDb()
  await buildBook(db, { chapters: [{ title: "One", scenes: [{}, {}] }] })
})
afterEach(() => db.close())

async function readBlocks(sceneId: string) {
  const doc = docFromState(await storedSceneReader(db)(sceneId))
  try {
    return tidyBlocks(docBlocks(doc))
  } finally {
    doc.destroy()
  }
}

/** A paragraph added on top of the prose, as the editor writes an edit to scene_updates. */
function appended(state: Uint8Array, line: string): Uint8Array {
  const doc = docFromState(state)
  try {
    const before = Y.encodeStateVector(doc)
    const paragraph = new Y.XmlElement("paragraph")
    paragraph.insert(0, [new Y.XmlText(line)])
    doc.getXmlFragment(PROSE_FIELD).push([paragraph])
    return Y.encodeStateAsUpdateV2(doc, before)
  } finally {
    doc.destroy()
  }
}

it("reads the scene's compaction and the edits written since", async () => {
  const state = blocksState(paras("First."))
  await insertRow(db, "snapshots", {
    id: "compaction",
    scene_id: "sc-One-1",
    state_b64: bytesToBase64(state),
    kind: "compaction",
    created_at: "2024-01-01T00:00:00.000Z",
  })
  await insertRow(db, "scene_updates", {
    id: "update",
    scene_id: "sc-One-1",
    update_b64: bytesToBase64(appended(state, "Second.")),
    created_at: "2024-01-02T00:00:00.000Z",
    created_by: "device",
  })
  // Neither a version nor another scene's prose is part of it.
  await insertRow(db, "snapshots", {
    id: "version",
    scene_id: "sc-One-1",
    state_b64: bytesToBase64(blocksState(paras("Older."))),
    kind: "manual",
    created_at: "2023-01-01T00:00:00.000Z",
  })
  await writeProse(db, "sc-One-2", paras("Elsewhere."))

  expect(await readBlocks("sc-One-1")).toEqual(paras("First.", "Second."))
})

it("reads a scene with nothing stored as empty", async () => {
  expect(await readBlocks("sc-One-1")).toEqual([])
})
