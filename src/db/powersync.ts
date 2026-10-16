import { PowerSyncDatabase } from "@powersync/web"
import { makeSchema } from "./schema"
import { seedIfEmpty } from "./seed"
import { purgeExpiredTrash } from "./trash"

/**
 * The one local database. M0 never calls `connect()`, so nothing leaves the device: the guest (`local_*`) tables
 * answer to the plain names, and those don't record changes in the upload queue.
 */
export const db = new PowerSyncDatabase({
  schema: makeSchema(false),
  database: { dbFilename: "bookbookbook.db" },
})

let opening: Promise<void> | undefined

/**
 * Opens the database, seeds the sample book on first run and empties expired Trash. Rejects with the reason if
 * storage is unusable.
 */
export function openDatabase(): Promise<void> {
  opening ??= (async () => {
    await db.init()
    await seedIfEmpty(db)
    // Housekeeping: a failure here shouldn't keep the writer out of their book.
    await purgeExpiredTrash(db).catch((error) => console.error("[db] purgeExpiredTrash", error))
  })()
  return opening
}
