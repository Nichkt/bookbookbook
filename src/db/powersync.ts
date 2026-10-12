import { PowerSyncDatabase } from "@powersync/web"
import { makeSchema } from "./schema"
import { seedIfEmpty } from "./seed"

/**
 * The one local database. M0 never calls `connect()`, so nothing leaves the device: the guest (`local_*`) tables
 * answer to the plain names, and those don't record changes in the upload queue.
 */
export const db = new PowerSyncDatabase({
  schema: makeSchema(false),
  database: { dbFilename: "bookbookbook.db" },
})

let opening: Promise<void> | undefined

/** Opens the database and seeds the sample book on first run. Rejects with the reason if storage is unusable. */
export function openDatabase(): Promise<void> {
  opening ??= (async () => {
    await db.init()
    await seedIfEmpty(db)
  })()
  return opening
}
