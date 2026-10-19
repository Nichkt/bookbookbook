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

/**
 * The sample book fills an empty library in development and in the end-to-end tests' build (e2e/preview.ts) only. A
 * real install, on the web or the desktop, starts with no books, and its build leaves the sample out.
 */
const SAMPLE_BOOK = import.meta.env.DEV || import.meta.env.MODE === "e2e"

let opening: Promise<void> | undefined

/**
 * Opens the database, seeds the sample book where that's wanted (above) and empties expired Trash. Rejects with the
 * reason if storage is unusable.
 */
export function openDatabase(): Promise<void> {
  opening ??= (async () => {
    await db.init()
    if (SAMPLE_BOOK) await seedIfEmpty(db)
    // Housekeeping: a failure here shouldn't keep the writer out of their book.
    await purgeExpiredTrash(db).catch((error) => console.error("[db] purgeExpiredTrash", error))
  })()
  return opening
}
