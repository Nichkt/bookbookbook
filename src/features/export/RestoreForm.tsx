import { usePowerSync } from "@powersync/react"
import { UploadIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { rememberBook } from "@/app/books"
import { noteRestored } from "@/backup/actions"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { restoreBackup } from "@/export/backup"
import { ExportError } from "@/export/errors"
import { closeBookDialog, setBookDialogBusy, useBookDialogs } from "@/features/books/dialogStore"
import { cn } from "@/lib/utils"

const FAILED = "Something went wrong, so nothing was restored. Try again?"

/**
 * Restore from backup, from the book menu or the empty library (DESIGN.md §13). The backup becomes a new book. One
 * restore at a time, and the dialog stays open till it's done, so a second drop or a retry can't make two books.
 */
export function RestoreForm() {
  const db = usePowerSync()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const restoring = useRef(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const restore = async (file: File) => {
    if (restoring.current) return
    restoring.current = true
    setBookDialogBusy(true)
    setBusy(true)
    setError(null)
    try {
      const restored = await restoreBackup(db, new Uint8Array(await file.arrayBuffer()))
      await noteRestored(db, restored)
      rememberBook(restored.bookId)
      setBookDialogBusy(false)
      if (useBookDialogs.getState().dialog === "restore") closeBookDialog()
      navigate(`/b/${restored.bookId}/write`)
      toast(`Restored “${restored.title}”`)
    } catch (caught) {
      if (caught instanceof ExportError) {
        setError(caught.message)
      } else {
        console.error("[restore]", caught)
        setError(FAILED)
      }
      setBusy(false)
    } finally {
      restoring.current = false
      setBookDialogBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Restore from backup</DialogTitle>
        <DialogDescription>
          Choose a backup zip made by Export. It comes back as a new book, beside the books you have.
        </DialogDescription>
      </DialogHeader>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          // While a restore runs, a drop does nothing, rather than letting the browser open the file.
          event.dataTransfer.dropEffect = restoring.current ? "none" : "copy"
          setDragging(!restoring.current)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) void restore(file)
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition-colors outline-none *:pointer-events-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60",
          dragging && "border-primary bg-accent",
        )}
      >
        <UploadIcon className="size-5" />
        {busy ? (
          <span>Restoring…</span>
        ) : (
          <span>
            <span className="font-medium text-ink">Choose a backup…</span>
            <span className="pointer-coarse:hidden"> or drop it here</span>
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          // So choosing the same file again, after fixing what went wrong, still counts as a change.
          event.target.value = ""
          if (file) void restore(file)
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={busy}>
            Cancel
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}
