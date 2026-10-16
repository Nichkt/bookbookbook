import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { makeSchema } from "@/db/schema"
import type { Db, SqlValue, Tx } from "@/db/tx"

/**
 * An in-memory SQLite shaped like the app's PowerSync database. Each table is a view over a backing table with
 * INSTEAD OF triggers, as in PowerSync, so writes report 0 affected rows and upserts fail here just as they do in
 * the browser.
 */
export function createTestDb(): Db & { close(): void } {
  const sqlite = new DatabaseSync(":memory:")
  for (const table of makeSchema(false).tables) {
    const view = table.viewName
    if (view.startsWith("inactive_")) continue
    const columns = table.columns.map((column) => column.name)
    const backing = `ps_${view}`
    sqlite.exec(`
      CREATE TABLE ${backing} (id TEXT PRIMARY KEY NOT NULL, ${table.columns.map((c) => `${c.name} ${c.type}`).join(", ")});
      CREATE VIEW ${view} AS SELECT id, ${columns.join(", ")} FROM ${backing};
      CREATE TRIGGER ${view}_insert INSTEAD OF INSERT ON ${view} BEGIN
        SELECT CASE WHEN NEW.id IS NULL THEN RAISE(FAIL, 'id is required') END;
        INSERT INTO ${backing} (id, ${columns.join(", ")}) VALUES (NEW.id, ${columns.map((c) => `NEW.${c}`).join(", ")});
      END;
      CREATE TRIGGER ${view}_update INSTEAD OF UPDATE ON ${view} BEGIN
        SELECT CASE WHEN OLD.id != NEW.id THEN RAISE(FAIL, 'Cannot update id') END;
        UPDATE ${backing} SET ${columns.map((c) => `${c} = NEW.${c}`).join(", ")} WHERE id = OLD.id;
      END;
      CREATE TRIGGER ${view}_delete INSTEAD OF DELETE ON ${view} BEGIN
        DELETE FROM ${backing} WHERE id = OLD.id;
      END;`)
  }

  const bind = (parameters: SqlValue[] = []) =>
    parameters.map((value) => (value === undefined ? null : value)) as SQLInputValue[]

  const tx: Tx = {
    async execute(sql, parameters) {
      const result = sqlite.prepare(sql).run(...bind(parameters))
      return { rowsAffected: Number(result.changes) }
    },
    async getAll<T>(sql: string, parameters?: SqlValue[]) {
      return sqlite.prepare(sql).all(...bind(parameters)).map((row) => ({ ...row })) as T[]
    },
    async getOptional<T>(sql: string, parameters?: SqlValue[]) {
      const row = sqlite.prepare(sql).get(...bind(parameters))
      return row ? ({ ...row } as T) : null
    },
    async get<T>(sql: string, parameters?: SqlValue[]) {
      const row = sqlite.prepare(sql).get(...bind(parameters))
      if (!row) throw new Error("Result set is empty")
      return { ...row } as T
    },
  }

  // One transaction at a time, like PowerSync's write lock.
  let queue: Promise<unknown> = Promise.resolve()
  return {
    ...tx,
    writeTransaction<T>(callback: (tx: Tx) => Promise<T>) {
      const run = async () => {
        sqlite.exec("BEGIN")
        try {
          const result = await callback(tx)
          sqlite.exec("COMMIT")
          return result
        } catch (error) {
          sqlite.exec("ROLLBACK")
          throw error
        }
      }
      const result = queue.then(run, run)
      queue = result.catch(() => undefined)
      return result
    },
    close: () => sqlite.close(),
  }
}
