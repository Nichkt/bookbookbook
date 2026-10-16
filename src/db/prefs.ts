import { usePowerSync, useQuery } from "@powersync/react"
import { useCallback } from "react"
import type { Db } from "./tx"

/*
 * Device-only view settings (DESIGN.md §5 `ui_prefs`), keyed like `plan.view:<bookId>`. Keys ending in `:<bookId>`
 * are deleted with the book.
 */

/** Sets a pref. Upserts can't run through PowerSync's views, so check for the row first. */
export async function setPref(db: Db, key: string, value: string) {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional("SELECT id FROM ui_prefs WHERE id = ?", [key])
    if (existing) await tx.execute("UPDATE ui_prefs SET value = ? WHERE id = ?", [value, key])
    else await tx.execute("INSERT INTO ui_prefs (id, value) VALUES (?, ?)", [key, value])
  })
}

export function usePref(key: string): {
  value: string | null
  isLoading: boolean
  setValue: (value: string) => Promise<void>
} {
  const db = usePowerSync()
  const { data, isLoading } = useQuery<{ value: string | null }>("SELECT value FROM ui_prefs WHERE id = ?", [key])
  const setValue = useCallback(
    (value: string) =>
      setPref(db, key, value).catch((error: unknown) => {
        console.error("[prefs]", key, error)
      }),
    [db, key],
  )
  return { value: data[0]?.value ?? null, isLoading, setValue }
}
