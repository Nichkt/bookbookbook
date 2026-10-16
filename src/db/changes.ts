import { insertRow, updateRow, type SqlValue, type Tx } from "./tx"

type Row = { id: string } & Record<string, SqlValue>

/**
 * Remembers the original state of every row a structural edit touches, so the edit can be undone exactly: rows it
 * changed or deleted are put back, rows it created are removed. Capture rows before changing them.
 */
export class ChangeSet {
  /** table → id → the row before the edit, or null if the edit created it. */
  private readonly originals = new Map<string, Map<string, Row | null>>()

  private rows(table: string) {
    let rows = this.originals.get(table)
    if (!rows) this.originals.set(table, (rows = new Map()))
    return rows
  }

  /** Remembers the current state of the rows matching `where`. A row captured twice keeps its first state. */
  async capture(tx: Tx, table: string, where: string, parameters: SqlValue[] = []) {
    const rows = this.rows(table)
    for (const row of await tx.getAll<Row>(`SELECT * FROM ${table} WHERE ${where}`, parameters)) {
      if (!rows.has(row.id)) rows.set(row.id, { ...row })
    }
  }

  /** Remembers the rows with these ids. */
  captureIds(tx: Tx, table: string, ids: readonly string[]) {
    return this.capture(tx, table, "id IN (SELECT value FROM json_each(?))", [JSON.stringify(ids)])
  }

  /** Notes a row the edit created. */
  created(table: string, id: string) {
    const rows = this.rows(table)
    if (!rows.has(id)) rows.set(id, null)
  }

  get isEmpty() {
    return [...this.originals.values()].every((rows) => rows.size === 0)
  }

  /** Puts every captured row back as it was. */
  async revert(tx: Tx) {
    for (const [table, rows] of this.originals) {
      for (const [id, original] of rows) {
        // Views can't report affected rows (INSTEAD OF triggers), so check for the row first.
        const exists = await tx.getOptional(`SELECT 1 AS present FROM ${table} WHERE id = ?`, [id])
        if (original === null) {
          if (exists) await tx.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
        } else if (exists) {
          const { id: _id, ...values } = original
          await updateRow(tx, table, id, values)
        } else {
          await insertRow(tx, table, original)
        }
      }
    }
  }
}
