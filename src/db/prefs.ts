import { usePowerSync, useQuery } from "@powersync/react"
import { useCallback, useState } from "react"
import type { Db } from "./tx"

/*
 * Device-only view settings (DESIGN.md §5 `ui_prefs`), keyed like `plan.view:<bookId>`. Keys ending in `:<bookId>`
 * are deleted with the book.
 */

/** A pref's value, outside React. */
export async function readPref(db: Db, key: string): Promise<string | null> {
  const row = await db.getOptional<{ value: string | null }>("SELECT value FROM ui_prefs WHERE id = ?", [key])
  return row?.value ?? null
}

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

interface PendingPref {
  key: string
  value: string
  /** Its writes still on their way to the database. */
  writing: number
}

/**
 * A pref that changes on screen at once, ahead of its write to the database. The choice shows until every write has
 * landed and the database has caught up with it, or an earlier write landing late would undo it for a moment.
 */
export function usePrefState(key: string) {
  const { value, isLoading, setValue } = usePref(key)
  const [pending, setPending] = useState<PendingPref | null>(null)
  if (pending && (pending.key !== key || (pending.writing === 0 && value === pending.value))) setPending(null)
  const set = useCallback(
    (next: string) => {
      setPending((previous) => ({ key, value: next, writing: (previous?.key === key ? previous.writing : 0) + 1 }))
      void setValue(next).finally(() =>
        setPending((previous) => (previous?.key === key ? { ...previous, writing: previous.writing - 1 } : previous)),
      )
    },
    [key, setValue],
  )
  return { value: pending?.key === key ? pending.value : value, isLoading, set }
}
