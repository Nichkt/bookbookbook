import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ChangeSet } from "@/db/changes"
import { createTestDb } from "@/test/sqliteDb"
import { createCustomTool, deleteCustomTool, updateCustomTool } from "./customTools"

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => db.close())

const rows = () => db.getAll("SELECT name, prompt_template, output_mode FROM custom_tools ORDER BY name")
const undo = (changes: ChangeSet) => db.writeTransaction((tx) => changes.revert(tx))

describe("custom tools", () => {
  it("creates, updates and deletes tools, with undo for delete", async () => {
    const id = await createCustomTool(db, { name: "  Rewrite voice ", template: "Use {selection}", mode: "variants" })
    expect(await rows()).toEqual([
      { name: "Rewrite voice", prompt_template: "Use {selection}", output_mode: "variants" },
    ])
    await updateCustomTool(db, id, { name: "List ideas", template: "List {world}", mode: "list" })
    const beforeDelete = await rows()
    expect(beforeDelete).toEqual([{ name: "List ideas", prompt_template: "List {world}", output_mode: "list" }])
    const changes = await deleteCustomTool(db, id)
    expect(await rows()).toEqual([])
    await undo(changes)
    expect(await rows()).toEqual(beforeDelete)
  })
})
