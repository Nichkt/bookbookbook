/**
 * The slice of PowerSync's database API that writes use. PowerSync's `db` and its transactions satisfy it, and so
 * does the in-memory SQLite the unit tests use (src/test/sqliteDb.ts).
 */
export type SqlValue = string | number | null

export interface Tx {
  /** Resolves when done. Writes go through views, so PowerSync can't report affected rows: don't rely on them. */
  execute(sql: string, parameters?: SqlValue[]): Promise<unknown>
  getAll<T>(sql: string, parameters?: SqlValue[]): Promise<T[]>
  getOptional<T>(sql: string, parameters?: SqlValue[]): Promise<T | null>
  get<T>(sql: string, parameters?: SqlValue[]): Promise<T>
}

export interface Db extends Tx {
  writeTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T>
}

/** Inserts a row given as an object. Table names come from code, never from user input. */
export async function insertRow(tx: Tx, table: string, row: Record<string, SqlValue>) {
  const columns = Object.keys(row)
  await tx.execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    Object.values(row),
  )
}

/** Updates the given columns of one row. */
export async function updateRow(tx: Tx, table: string, id: string, values: Record<string, SqlValue>) {
  const columns = Object.keys(values)
  if (columns.length === 0) return
  await tx.execute(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`, [
    ...Object.values(values),
    id,
  ])
}
