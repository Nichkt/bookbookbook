import { usePowerSync } from "@powersync/react"
import { Trash2Icon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { rememberBook } from "@/app/books"
import { desktop } from "@/app/desktop"
import { attempt, offerUndo } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { BookListRow } from "@/db/queries"
import { BackupsDialog } from "@/features/backup/BackupsDialog"
import { ExportForm } from "@/features/export/ExportForm"
import { RestoreForm } from "@/features/export/RestoreForm"
import { TermHint } from "@/features/help/TermHint"
import { ImportForm } from "@/features/import/ImportForm"
import { BUILTIN_STRUCTURES } from "@/features/plan/structures"
import { useCustomStructures } from "@/features/plan/useStructures"
import { UpdatesDialog } from "@/features/updates/UpdatesDialog"
import { formatCount, parseCount, tidyCount } from "@/lib/numbers"
import {
  AUDIENCE_OPTIONS,
  NOT_SET,
  passagesText,
  POV_OPTIONS,
  storedPassages,
  styleChoice,
  TENSE_OPTIONS,
  type StyleOption,
} from "./bookStyle"
import { closeBookDialog, returnFocusOnClose, useBookDialogs } from "./dialogStore"
import { createBook, DEFAULT_BOOK_TARGET, trashBook, updateBook } from "./mutations"
import { START_BLANK, START_WIZARD, startAbout, startValue } from "./newBookStart"
import { TrashList } from "./TrashList"

const onOpenChange = (open: boolean) => {
  // Escape, the close button and Cancel all come here, so a dialog that's busy stays open.
  if (!open && !useBookDialogs.getState().busy) closeBookDialog()
}

/**
 * New book, Book settings, Export, Restore, Import, Trash and Backups, opened from the header's book menu
 * (DESIGN.md §4, §12, §13), and Updates, in the desktop app (§11).
 */
export function BookDialogs({ book }: { book: BookListRow | undefined }) {
  const dialog = useBookDialogs((state) => state.dialog)
  return (
    <>
      <Dialog open={dialog === "new"} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={returnFocusOnClose}>
          <NewBookForm />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "settings" && Boolean(book)} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={returnFocusOnClose}
          onInteractOutside={(event) => event.preventDefault()}
        >
          {book && <BookSettingsForm book={book} />}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "export" && Boolean(book)} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={returnFocusOnClose}
        >
          {book && <ExportForm book={book} />}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "restore"} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={returnFocusOnClose}>
          <RestoreForm />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "import"} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto sm:max-w-2xl"
          onCloseAutoFocus={returnFocusOnClose}
          // The preview holds the writer's changes: a stray click beside it mustn't throw them away.
          onInteractOutside={(event) => event.preventDefault()}
        >
          <ImportForm />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "trash"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" onCloseAutoFocus={returnFocusOnClose}>
          <TrashList bookId={book?.id} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "backups"} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={returnFocusOnClose}
        >
          <BackupsDialog book={book} />
        </DialogContent>
      </Dialog>
      {desktop && (
        <Dialog open={dialog === "updates"} onOpenChange={onOpenChange}>
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
            onCloseAutoFocus={returnFocusOnClose}
          >
            <UpdatesDialog />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function NewBookForm() {
  const db = usePowerSync()
  const navigate = useNavigate()
  const custom = useCustomStructures()
  const [title, setTitle] = useState("")
  const [target, setTarget] = useState(formatCount(DEFAULT_BOOK_TARGET))
  const [start, setStart] = useState(START_BLANK)
  const [busy, setBusy] = useState(false)
  const structure = [...BUILTIN_STRUCTURES, ...custom].find((each) => startValue(each) === start) ?? null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (isBadCount(target)) return document.getElementById("new-book-target")?.focus()
    setBusy(true)
    const created = await attempt("new book", createBook(db, { title, targetWords: parseCount(target), structure }))
    setBusy(false)
    if (!created) return
    rememberBook(created.bookId)
    closeBookDialog()
    // The Plan opens the step-by-step dialog when it arrives with this.
    navigate(`/b/${created.bookId}/plan`, start === START_WIZARD ? { state: { wizard: true } } : undefined)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New book</DialogTitle>
        <DialogDescription>Give it a name and a size, and choose how to start. You can change it all later.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="new-book-title">Title</Label>
        <Input
          id="new-book-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled book"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-book-target">Word count target</Label>
        <WordTargetInput id="new-book-target" value={target} onChange={setTarget} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-book-start">Start with</Label>
        <Select value={start} onValueChange={setStart}>
          <SelectTrigger id="new-book-start" className="w-full" aria-describedby="new-book-start-about">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectItem value={START_BLANK}>One blank chapter</SelectItem>
              <SelectItem value={START_WIZARD}>Plan it step by step</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>A chapter for each moment of</SelectLabel>
              {BUILTIN_STRUCTURES.map((each) => (
                <SelectItem key={each.key} value={startValue(each)}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {custom.length > 0 && (
              <SelectGroup>
                <SelectLabel>Or of one of your own</SelectLabel>
                {custom.map((each) => (
                  <SelectItem key={each.key} value={startValue(each)}>
                    {each.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <p id="new-book-start-about" className="text-xs text-ink-2">
          {structure
            ? startAbout(structure)
            : start === START_WIZARD
              ? "A few questions to get you going: your story in a sentence, then in five, your main characters, and " +
                "the chapters they suggest. Skip any you like."
              : "Plan the rest on the Board or in the Outline."}
        </p>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          Create book
        </Button>
      </DialogFooter>
    </form>
  )
}

function BookSettingsForm({ book }: { book: BookListRow }) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [title, setTitle] = useState(book.title ?? "")
  const [author, setAuthor] = useState(book.author ?? "")
  const [genre, setGenre] = useState(book.genre ?? "")
  const [target, setTarget] = useState(book.target_words ? formatCount(book.target_words) : "")
  const [premise, setPremise] = useState(book.premise ?? "")
  const [synopsis, setSynopsis] = useState(book.synopsis ?? "")
  const [pov, setPov] = useState(book.pov ?? "")
  const [tense, setTense] = useState(book.tense ?? "")
  const [audience, setAudience] = useState(book.audience ?? "")
  const [styleGuide, setStyleGuide] = useState(book.style_guide ?? "")
  const [samples, setSamples] = useState(passagesText(book.sample_passages))
  const name = book.title?.trim() || "Untitled book"

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (isBadCount(target)) return document.getElementById("book-target")?.focus()
    const patch = {
      title: title.trim() || "Untitled book",
      author: author.trim(),
      genre: genre.trim(),
      target_words: parseCount(target),
      premise: premise.trim(),
      synopsis: synopsis.trim(),
      pov,
      tense,
      audience,
      style_guide: styleGuide.trim(),
      sample_passages: storedPassages(samples),
    }
    const saved = await attempt("book settings", updateBook(db, book.id, patch).then(() => true))
    if (saved) closeBookDialog()
  }

  const moveToTrash = async () => {
    const changes = await attempt("trash book", trashBook(db, book.id))
    if (!changes) return
    closeBookDialog()
    navigate("/")
    offerUndo(db, `Moved “${name}” to the Trash`, changes, () => navigate(`/b/${book.id}/plan`))
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Book settings</DialogTitle>
        <DialogDescription>{name}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="book-title">Title</Label>
        <Input id="book-title" value={title} onChange={(event) => setTitle(event.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-author">Author</Label>
        <Input
          id="book-author"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Your name, as on the title page"
          autoComplete="name"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-genre">Genre</Label>
        <Input
          id="book-genre"
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          placeholder="Literary mystery"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-target">Word count target</Label>
        <WordTargetInput id="book-target" value={target} onChange={setTarget} />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="book-premise">Premise</Label>
          <TermHint term="premise" />
        </div>
        <Textarea
          id="book-premise"
          value={premise}
          onChange={(event) => setPremise(event.target.value)}
          placeholder="Your story in one sentence"
          rows={2}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="book-synopsis">Synopsis</Label>
          <TermHint term="synopsis" />
        </div>
        <Textarea
          id="book-synopsis"
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          placeholder="The whole story, start to finish, in a paragraph or two"
          rows={4}
        />
      </div>
      <section aria-labelledby="book-ai-heading" className="grid gap-4 border-t pt-4">
        <div className="grid gap-1">
          <h3 id="book-ai-heading" className="font-medium text-ink">
            For the AI tools
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            How the book is told, so what the AI tools write fits it. Any of it can stay empty.
          </p>
        </div>
        <StyleSelect
          id="book-pov"
          label="Point of view"
          term="point-of-view"
          options={POV_OPTIONS}
          value={pov}
          onChange={setPov}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <StyleSelect
            id="book-tense"
            label="Tense"
            term="tense"
            options={TENSE_OPTIONS}
            value={tense}
            onChange={setTense}
          />
          <StyleSelect
            id="book-audience"
            label="Who it's for"
            options={AUDIENCE_OPTIONS}
            value={audience}
            onChange={setAudience}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="book-style-guide">Style guide</Label>
            <TermHint term="style-guide" />
          </div>
          <Textarea
            id="book-style-guide"
            value={styleGuide}
            onChange={(event) => setStyleGuide(event.target.value)}
            placeholder="Short sentences. No adverbs in dialogue tags. British spelling."
            rows={3}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="book-samples">Sample passages</Label>
          <Textarea
            id="book-samples"
            aria-describedby="book-samples-about"
            value={samples}
            onChange={(event) => setSamples(event.target.value)}
            placeholder="A few paragraphs you're proud of"
            rows={4}
          />
          <p id="book-samples-about" className="text-xs text-muted-foreground">
            Your own writing, for the AI tools to match your voice. Put a blank line between passages.
          </p>
        </div>
      </section>
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void moveToTrash()}
        >
          <Trash2Icon />
          Move to Trash
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit">Save</Button>
        </div>
      </DialogFooter>
    </form>
  )
}

const isBadCount = (text: string) => text.trim() !== "" && parseCount(text) === null

interface StyleSelectProps {
  id: string
  label: string
  /** A glossary term explaining it. */
  term?: string
  options: readonly StyleOption[]
  /** As the book stores it: "" for none. */
  value: string
  onChange: (value: string) => void
}

function StyleSelect({ id, label, term, options, value, onChange }: StyleSelectProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {term && <TermHint term={term} />}
      </div>
      <Select value={styleChoice(options, value)} onValueChange={(next) => onChange(next === NOT_SET ? "" : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={NOT_SET}>Not set</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** A book's word count target: takes "80000" or "80,000", and shows separators once you leave it. */
function WordTargetInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const invalid = isBadCount(value)
  return (
    <>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="None"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onChange(tidyCount(value))}
        className="tabular-nums"
      />
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          Type a number of words, like 80,000, or leave it empty.
        </p>
      )}
    </>
  )
}
