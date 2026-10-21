import { toast } from "sonner"
import type { ChangeSet } from "@/db/changes"
import type { Db } from "@/db/tx"
import { skipHistory, TRACKED } from "@/undo/recorder"
import { forgetStep, tookBack, undoStep } from "@/undo/undoHistory"
import { announce } from "./announce"

export { announce, useAnnouncer } from "./announce"

/*
 * How the app talks back: screen-reader announcements for things that happen without a visible message (a card
 * moved), toasts with Undo for structural edits (DESIGN.md §6, §12), and a toast when a save fails.
 */

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

/** The first sentence of a toast's message, as Undo's button names the edit: "Moved “Gulls” to the Trash". */
const stepLabel = (message: string) => message.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "")

/**
 * Shows `message` with an Undo button that puts every row the edit touched back as it was. When the book's history
 * (src/undo/) recorded all of the edit, the button undoes it there, so Redo can bring it back.
 */
export function offerUndo(db: Db, message: string, changes: ChangeSet, onUndone?: () => void) {
  if (changes.isEmpty) {
    toast(message)
    return
  }
  const step = changes.recording?.step
  const whole = step !== undefined && changes.tables.every((table) => table in TRACKED)
  if (step) {
    step.label = stepLabel(message)
    // Later typing in the same field is an edit of its own.
    step.sealed = true
  }
  const toastId = toast(message, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        // Sonner puts focus back where it was before the toast took it, once focus leaves the toast. Let that happen
        // now rather than when onUndone focuses something, which it would otherwise undo.
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest("[data-sonner-toaster]")) active.blur()
        if (whole) {
          void attempt(
            "undo",
            undoStep(step).then((outcome) => {
              if (outcome === "already") announce("Already undone")
              if (outcome !== "undone" && outcome !== "nothing") return
              announce("Undone")
              onUndone?.()
            }),
          )
          return
        }
        void attempt(
          "undo",
          db
            .writeTransaction(async (tx) => {
              skipHistory(tx)
              await changes.revert(tx)
            })
            .then(() => {
              if (step) forgetStep(step)
              tookBack()
              announce("Undone")
              onUndone?.()
            }),
        )
      },
    },
  })
  if (step) step.toastId = toastId
}
