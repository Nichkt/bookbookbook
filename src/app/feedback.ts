import { toast } from "sonner"
import { create } from "zustand"
import type { ChangeSet } from "@/db/changes"
import type { Db } from "@/db/tx"

/*
 * How the app talks back: screen-reader announcements for things that happen without a visible message (a card
 * moved), toasts with Undo for structural edits (DESIGN.md §6, §12), and a toast when a save fails.
 */

interface AnnouncerState {
  message: string
  /** Bumped on every announcement, so the same words are read again. */
  count: number
}

export const useAnnouncer = create<AnnouncerState>(() => ({ message: "", count: 0 }))

export function announce(message: string) {
  useAnnouncer.setState((state) => ({ message, count: state.count + 1 }))
}

export function reportError(context: string, error: unknown) {
  console.error(`[${context}]`, error)
  toast.error("Something went wrong, so that last change may not have saved.")
}

/** Runs a fire-and-forget edit, reporting failure instead of leaving an unhandled rejection. */
export function attempt<T>(context: string, work: Promise<T>): Promise<T | undefined> {
  return work.catch((error: unknown) => {
    reportError(context, error)
    return undefined
  })
}

export const UNDO_MS = 8000

/** Shows `message` with an Undo button that puts every row the edit touched back as it was. */
export function offerUndo(db: Db, message: string, changes: ChangeSet, onUndone?: () => void) {
  if (changes.isEmpty) {
    toast(message)
    return
  }
  toast(message, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        void attempt(
          "undo",
          db.writeTransaction((tx) => changes.revert(tx)).then(() => {
            announce("Undone")
            onUndone?.()
          }),
        )
      },
    },
  })
}
