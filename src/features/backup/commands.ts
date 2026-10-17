import { toast } from "sonner"
import { downloadBackup } from "@/backup/actions"
import { allowFolder, chooseFolder, folderAccess, stopFolder, type FolderOutcome } from "@/backup/scheduler"
import type { Db } from "@/db/tx"
import { ExportError } from "@/export/errors"

/*
 * The backup buttons' work, for the reminder and the Backups dialog alike (DESIGN.md §12), with a word on how it
 * went. Each returns once it's done, and never throws.
 */

const folderName = () => {
  const { pref, handle } = folderAccess()
  return pref?.name ?? handle?.name ?? "the folder"
}

function sayFolder(outcome: FolderOutcome | null, done: (name: string) => string) {
  if (outcome === "up-to-date") toast(done(folderName()))
  // What went wrong shows in the reminder and the dialog.
  else if (outcome === "failed") toast.error(`Couldn’t write to “${folderName()}”. Try another folder?`)
}

/** Back up now: the book, as a download. */
export async function backUpBook(db: Db, bookId: string) {
  try {
    const file = await downloadBackup(db, bookId)
    toast(`Downloaded “${file.name}”`)
  } catch (error) {
    if (error instanceof ExportError) {
      toast.error(error.message)
    } else {
      console.error("[backups]", error)
      toast.error("Something went wrong, so nothing was backed up. Try again?")
    }
  }
}

/** Asks for a folder, and backs every book up to it. */
export async function startFolderBackups(db: Db) {
  try {
    sayFolder(await chooseFolder(db), (name) => `Backed up every book to “${name}”`)
  } catch (error) {
    console.error("[backups]", error)
    toast.error("Something went wrong, so folder backups didn’t start. Try again?")
  }
}

/** Asks for permission to write to the folder again, and backs up to it. */
export async function resumeFolderBackups(db: Db) {
  try {
    sayFolder(await allowFolder(db), (name) => `Backing up to “${name}” again`)
  } catch (error) {
    console.error("[backups]", error)
    toast.error("Something went wrong, so folder backups are still paused. Try again?")
  }
}

/** Stops folder backups, leaving what they wrote. */
export async function stopFolderBackups(db: Db) {
  const name = folderName()
  try {
    await stopFolder(db)
    toast(`Stopped backing up to “${name}”. The backups there stay.`)
  } catch (error) {
    console.error("[backups]", error)
    toast.error("Something went wrong, so folder backups haven’t stopped. Try again?")
  }
}
