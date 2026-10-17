import { usePowerSync } from "@powersync/react"
import { DownloadIcon } from "lucide-react"
import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePref } from "@/db/prefs"
import type { BookListRow } from "@/db/queries"
import { downloadFile } from "@/export/download"
import { ExportError } from "@/export/errors"
import { closeBookDialog, useBookDialogs } from "@/features/books/dialogStore"
import { updateBook } from "@/features/books/mutations"
import { exportPrefKey, FONTS, FORMATS, HEADINGS, PAPERS, parseChoices, type ExportChoices } from "./choices"
import { exportBook } from "./exportBook"

const FAILED = "Something went wrong, so nothing was exported. Try again?"

/** Export, from the book menu (DESIGN.md §13): the manuscript as a file to send, or a backup of the whole book. */
export function ExportForm({ book }: { book: BookListRow }) {
  const { value, isLoading, setValue } = usePref(exportPrefKey(book.id))
  return (
    <>
      <DialogHeader>
        <DialogTitle>Export</DialogTitle>
        <DialogDescription>{book.title?.trim() || "Untitled book"}</DialogDescription>
      </DialogHeader>
      {!isLoading && <ExportFields book={book} stored={value} saveChoices={setValue} />}
    </>
  )
}

interface ExportFieldsProps {
  book: BookListRow
  stored: string | null
  saveChoices: (value: string) => Promise<void>
}

function ExportFields({ book, stored, saveChoices }: ExportFieldsProps) {
  const db = usePowerSync()
  const id = useId()
  const [choices, setChoices] = useState(() => parseChoices(stored, navigator.language))
  const [author, setAuthor] = useState(book.author ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { format } = choices

  const update = (patch: Partial<ExportChoices>) => {
    setChoices((current) => ({ ...current, ...patch }))
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    void saveChoices(JSON.stringify(choices))
    try {
      const name = author.trim()
      if (format === "docx" && name !== (book.author ?? "").trim()) await updateBook(db, book.id, { author: name })
      const file = await exportBook(db, book.id, choices)
      downloadFile(file)
      toast(`Exported “${file.name}”`)
      if (useBookDialogs.getState().dialog === "export") closeBookDialog()
    } catch (caught) {
      if (caught instanceof ExportError) {
        setError(caught.message)
      } else {
        console.error("[export]", caught)
        setError(FAILED)
      }
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <fieldset>
        <legend className="mb-3 text-sm leading-none font-medium">Format</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FORMATS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name={`${id}-format`}
                value={option.value}
                checked={format === option.value}
                onChange={() => update({ format: option.value })}
                // The fields arrive after the dialog opens, which focuses its close button for want of anything else.
                autoFocus={format === option.value}
                aria-labelledby={`${id}-${option.value}`}
                aria-describedby={`${id}-${option.value}-hint`}
                className="mt-px size-4 shrink-0 accent-primary outline-none"
              />
              <span className="grid gap-1.5">
                <span id={`${id}-${option.value}`} className="text-sm leading-none font-medium">
                  {option.label} <span className="font-normal text-muted-foreground">{option.extension}</span>
                </span>
                <span id={`${id}-${option.value}-hint`} className="text-xs text-muted-foreground">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {format === "backup" ? (
        <p className="text-sm text-muted-foreground">
          One zip with everything in this book: plan, codex, prose, named versions and writing stats, plus a Markdown
          copy to read anywhere. Restore it from the book menu, in this browser or another.
        </p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-headings`}>Chapter headings</Label>
          <Select
            value={choices.headings}
            onValueChange={(value) => {
              const option = HEADINGS.find((heading) => heading.value === value)
              if (option) update({ headings: option.value })
            }}
          >
            <SelectTrigger id={`${id}-headings`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {HEADINGS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {format === "docx" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-author`}>Author</Label>
            <Input
              id={`${id}-author`}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              aria-describedby={`${id}-author-help`}
            />
            <p id={`${id}-author-help`} className="text-xs text-muted-foreground">
              On the title page and atop every page. Saved with the book.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <span id={`${id}-font`} className="text-sm leading-none font-medium">
                Font
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-labelledby={`${id}-font`}
                value={choices.font}
                onValueChange={(value) => {
                  const option = FONTS.find((font) => font.value === value)
                  if (option) update({ font: option.value })
                }}
                className="w-full"
              >
                {FONTS.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid gap-2">
              <span id={`${id}-paper`} className="text-sm leading-none font-medium">
                Paper
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-labelledby={`${id}-paper`}
                value={choices.paper}
                onValueChange={(value) => {
                  const option = PAPERS.find((paper) => paper.value === value)
                  if (option) update({ paper: option.value })
                }}
                className="w-full"
              >
                {PAPERS.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </>
      )}

      {(format === "markdown" || format === "text") && (
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox
            id={`${id}-per-chapter`}
            checked={choices.perChapter}
            onCheckedChange={(checked) => update({ perChapter: checked === true })}
          />
          <Label htmlFor={`${id}-per-chapter`} className="font-normal">
            A file per chapter, in a zip
          </Label>
        </div>
      )}

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
        <Button type="submit" disabled={busy}>
          <DownloadIcon />
          {busy ? "Exporting…" : "Export"}
        </Button>
      </DialogFooter>
    </form>
  )
}
