import { UploadIcon } from "lucide-react"
import { useId, useRef, useState, type DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ImportError } from "@/import/errors"
import { IMPORT_ACCEPT, readFile, readPaste, type ImportSource } from "@/import/read"
import { cn } from "@/lib/utils"
import { draftOf, type Draft } from "./draft"
import { ImportPreview } from "./ImportPreview"

const READ_FAILED = "Something went wrong reading that. Try again?"

/** Lets "Reading…" show before the reading, which holds up the page till it's done. */
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files")

/**
 * Import a manuscript, from the book menu or the empty library (DESIGN.md §13): a file or a paste, read and split
 * into chapters, then a preview where the writer can change that before anything's imported.
 */
export function ImportForm() {
  // Kept for Back, so a paste can be fixed rather than pasted again.
  const [text, setText] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  return draft ? (
    <ImportPreview initial={draft} onBack={() => setDraft(null)} />
  ) : (
    <SourceStep text={text} onTextChange={setText} onRead={setDraft} />
  )
}

interface SourceStepProps {
  text: string
  onTextChange: (text: string) => void
  onRead: (draft: Draft) => void
}

function SourceStep({ text, onTextChange, onRead }: SourceStepProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const reading = useRef(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = async (load: () => ImportSource | Promise<ImportSource>) => {
    if (reading.current) return
    reading.current = true
    setBusy(true)
    setError(null)
    try {
      await nextPaint()
      onRead(draftOf(await load()))
    } catch (caught) {
      if (caught instanceof ImportError) {
        setError(caught.message)
      } else {
        console.error("[import]", caught)
        setError(READ_FAILED)
      }
      setBusy(false)
    } finally {
      reading.current = false
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim()) void read(() => readPaste(text))
      }}
      // A file dropped anywhere in the dialog, not only on the button, rather than the browser opening it.
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = reading.current ? "none" : "copy"
        setDragging(!reading.current)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0]
        if (!file) return
        event.preventDefault()
        setDragging(false)
        void read(() => readFile(file))
      }}
    >
      <DialogHeader>
        <DialogTitle>Import a manuscript</DialogTitle>
        <DialogDescription>
          A Word document, Markdown or plain text becomes a new book. You’ll see where its chapters start, and can change
          that, before anything’s imported.
        </DialogDescription>
      </DialogHeader>
      <button
        type="button"
        // Not disabled while reading, which would drop focus: a click then does nothing.
        aria-disabled={busy}
        aria-describedby={`${id}-kinds`}
        autoFocus={!text}
        onClick={() => {
          if (!reading.current) input.current?.click()
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-7 text-sm text-muted-foreground transition-colors outline-none *:pointer-events-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-wait aria-disabled:opacity-60",
          dragging && "border-primary bg-accent",
        )}
      >
        <UploadIcon className="size-5" />
        {busy ? (
          <span>Reading…</span>
        ) : (
          <span>
            <span className="font-medium text-ink">Choose a file…</span>
            <span className="pointer-coarse:hidden"> or drop it here</span>
          </span>
        )}
        <span id={`${id}-kinds`} aria-hidden className="text-xs">
          Word (.docx), Markdown (.md) or plain text (.txt)
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={IMPORT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          // So choosing the same file again, after fixing what went wrong, still counts as a change.
          event.target.value = ""
          if (file) void read(() => readFile(file))
        }}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-paste`}>Or paste the text</Label>
        <Textarea
          id={`${id}-paste`}
          value={text}
          autoFocus={Boolean(text)}
          readOnly={busy}
          onChange={(event) => {
            onTextChange(event.target.value)
            setError(null)
          }}
          className="field-sizing-fixed h-28 resize-none"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy || !text.trim()}>
          Continue
        </Button>
      </DialogFooter>
    </form>
  )
}
