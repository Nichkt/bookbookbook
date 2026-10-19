import { usePowerSync } from "@powersync/react"
import {
  BookPlusIcon,
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  FolderInputIcon,
  MicIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import { rememberBook, useCurrentBook } from "@/app/books"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { PlaceholderScreen } from "@/app/PlaceholderScreens"
import { DeferredMenu } from "@/components/DeferredMenu"
import { DraftTextarea } from "@/components/DraftField"
import { Button } from "@/components/ui/button"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAfterMenu } from "@/components/useAfterMenu"
import { codexPath, useCodex, type Codex } from "@/features/codex/codexData"
import { usePlan, type Plan } from "@/features/plan/planData"
import { AddToWorldDialog } from "@/features/write/AddToWorldDialog"
import { openAddToWorldWith } from "@/features/write/addToWorld"
import { copyText } from "@/features/write/ai/aiActions"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { sttEngineLabel } from "@/speech/engine"
import { FileNoteDialog } from "./FileNoteDialog"
import {
  filedPlace,
  filingText,
  notePreview,
  noteWhen,
  useInbox,
  worldIdea,
  type FiledTo,
  type FileTarget,
  type Inbox,
  type InboxNote,
  type Places,
} from "./inboxData"
import { deleteNote, fileToChapter, fileToEntry, markMadeIntoEntry, unfileNote, updateNoteText } from "./mutations"
import { NoteComposer } from "./NoteComposer"

type List = "sort" | "filed"

const CAPTURE = "inbox-capture"
const CAPTURE_BOX = byData("note-text", CAPTURE)

/** Each list's note button that focus moves on to: To sort's File, Filed's ⋯. */
const LANDING: Record<List, string> = { sort: "inbox-file", filed: "inbox-menu" }

const LIST_ITEM =
  "h-7 rounded-md px-2.5 text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-background data-[state=on]:text-ink data-[state=on]:shadow-sm pointer-coarse:h-11"

/** `/b/:bookId/inbox`: notes caught on the fly, to sort into the book (DESIGN.md §10). */
export function InboxScreen() {
  const { bookId = "" } = useParams()
  return <InboxBook key={bookId} bookId={bookId} />
}

function InboxBook({ bookId }: { bookId: string }) {
  const { book, isLoading: booksLoading } = useCurrentBook()
  const inbox = useInbox(bookId)
  const { plan, isLoading: planLoading } = usePlan(bookId)
  const codex = useCodex(bookId)
  if (booksLoading || inbox.isLoading || planLoading || codex.isLoading) return null
  if (!book) {
    return (
      <PlaceholderScreen title="Book not found" milestone="Inbox">
        <p>It may have been deleted. Pick another book from the book menu above, or restore it from the Trash there.</p>
      </PlaceholderScreen>
    )
  }
  return <InboxPage bookId={bookId} inbox={inbox} plan={plan} codex={codex} />
}

interface FilingState {
  open: boolean
  /** Bumped each time it opens, so the form starts afresh. */
  session: number
  note: InboxNote | null
  returnFocus: HTMLElement | null
  /** Where focus goes once it's closed, in place of `returnFocus`: on from a note that's been filed. */
  focusAfter: string | null
}

const NOT_FILING: FilingState = { open: false, session: 0, note: null, returnFocus: null, focusAfter: null }

/** Where focus goes once a note leaves its list: on to the next note, or back to the one before, else to the box. */
function focusAfterLeaving(notes: readonly InboxNote[], noteId: string, list: List) {
  const index = notes.findIndex((note) => note.id === noteId)
  const next = index < 0 ? undefined : (notes[index + 1] ?? notes[index - 1])
  return next ? byData(LANDING[list], next.id) : CAPTURE_BOX
}

/** What each note's buttons do. */
interface NoteActions {
  file: (note: InboxNote, button: HTMLElement) => void
  makeEntry: (note: InboxNote, button: HTMLElement) => void
  moveBack: (note: InboxNote) => void
  remove: (note: InboxNote, list: List) => void
}

function InboxPage({ bookId, inbox, plan, codex }: { bookId: string; inbox: Inbox; plan: Plan; codex: Codex }) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [list, setList] = useState<List>("sort")
  const [filing, setFiling] = useState<FilingState>(NOT_FILING)
  const places: Places = { chapterById: plan.chapterById, entryById: codex.entryById }

  useEffect(() => {
    rememberBook(bookId)
  }, [bookId])

  /** Shows a note that Undo put back in `to`. */
  const showAgain = (noteId: string, to: List) => {
    setList(to)
    focusSoon(byData(LANDING[to], noteId))
  }

  const fileNote = async (note: InboxNote, target: FileTarget) => {
    const changes = await attempt(
      "file note",
      target.kind === "chapter"
        ? fileToChapter(db, note.id, target.id, target.as)
        : fileToEntry(db, note.id, target.id),
    )
    if (!changes) return
    setFiling((state) => ({ ...state, open: false, focusAfter: focusAfterLeaving(inbox.toSort, note.id, "sort") }))
    const filedTo: FiledTo = target.kind === "chapter" ? { ...target, at: "" } : { ...target, as: "notes", at: "" }
    offerUndo(db, filingText(filedTo, filedPlace(filedTo, places)), changes, () => showAgain(note.id, "sort"))
  }

  const actions: NoteActions = {
    file: (note, button) => {
      if (!note.text.trim()) {
        toast("This note is empty. Write something in it first, or delete it.")
        return
      }
      setFiling((state) => ({ open: true, session: state.session + 1, note, returnFocus: button, focusAfter: null }))
    },
    makeEntry: (note, button) => {
      const after = focusAfterLeaving(inbox.toSort, note.id, "sort")
      openAddToWorldWith({ ...worldIdea(note.text), typeKey: null }, button, (entryId) => {
        void attempt("file note", markMadeIntoEntry(db, note.id, entryId))
        return () => focusSoon(after)
      })
    },
    moveBack: (note) => {
      const after = focusAfterLeaving(inbox.filed, note.id, "filed")
      void attempt("move note back", unfileNote(db, note.id)).then((changes) => {
        if (!changes) return
        focusSoon(after)
        offerUndo(db, "Moved back to To sort.", changes, () => showAgain(note.id, "filed"))
      })
    },
    remove: (note, from) => {
      const after = focusAfterLeaving(from === "sort" ? inbox.toSort : inbox.filed, note.id, from)
      void attempt("delete note", deleteNote(db, note.id)).then((changes) => {
        if (!changes) return
        focusSoon(after)
        offerUndo(db, "Note deleted.", changes, () => showAgain(note.id, from))
      })
    },
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10" data-inbox="">
      <h1 className="font-heading text-3xl font-semibold">Inbox</h1>
      <p className="mt-1 text-ink-2">
        Catch ideas as they come, typed or dictated, and sort them into your book later.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4" data-tour="inbox-capture">
        <NoteComposer
          bookId={bookId}
          targetId={CAPTURE}
          label="New note"
          submitLabel="Add note"
          onAdded={() => {
            setList("sort")
            announce("Note added")
          }}
        />
      </div>

      <ToggleGroup
        type="single"
        spacing={1}
        aria-label="Notes to show"
        data-tour="inbox-lists"
        value={list}
        onValueChange={(next) => {
          if (next === "sort" || next === "filed") setList(next)
        }}
        className="mt-8 mb-3 gap-0 rounded-lg bg-muted p-0.5"
      >
        <ToggleGroupItem value="sort" className={LIST_ITEM} data-inbox-list="sort">
          To sort <span className="text-muted-foreground tabular-nums">{formatCount(inbox.toSort.length)}</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="filed" className={LIST_ITEM} data-inbox-list="filed">
          Filed <span className="text-muted-foreground tabular-nums">{formatCount(inbox.filed.length)}</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {list === "sort" ? (
        inbox.toSort.length === 0 ? (
          inbox.filed.length === 0 ? (
            <Empty title="Your Inbox is empty">
              Notes you add here, or with Quick note from anywhere in this book, wait in To sort until you file them.
            </Empty>
          ) : (
            <Empty title="All sorted">New notes wait here until you file them.</Empty>
          )
        ) : (
          <ul aria-label="To sort" className="grid gap-3">
            {inbox.toSort.map((note, index) => (
              <SortCard key={note.id} note={note} tour={index === 0} actions={actions} />
            ))}
          </ul>
        )
      ) : inbox.filed.length === 0 ? (
        <Empty title="Nothing filed yet">When you file a note, it moves here and says where it went.</Empty>
      ) : (
        <ul aria-label="Filed" className="grid gap-3">
          {inbox.filed.map((note) => (
            <FiledCard key={note.id} bookId={bookId} note={note} places={places} actions={actions} />
          ))}
        </ul>
      )}

      <FileNoteDialog
        open={filing.open}
        session={filing.session}
        note={filing.note}
        plan={plan}
        codex={codex}
        onClose={() => setFiling((state) => ({ ...state, open: false }))}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (filing.focusAfter) focusSoon(filing.focusAfter)
          else if (filing.returnFocus?.isConnected) filing.returnFocus.focus()
        }}
        onFile={fileNote}
      />
      <AddToWorldDialog bookId={bookId} showEntry={(entryId) => navigate(codexPath(bookId, entryId))} />
    </section>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground"
      data-inbox-empty=""
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md">{children}</p>
    </div>
  )
}

/** When it was made, and how it was heard if it was dictated. */
function NoteMeta({ note }: { note: InboxNote }) {
  const when = noteWhen(note.createdAt)
  const dictated = note.source === "voice-live"
  const heard = dictated ? sttEngineLabel(note.sttEngine) : null
  const date = new Date(note.createdAt)
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      {dictated && (
        <>
          <span className="inline-flex items-center gap-1" data-inbox-dictated="">
            <MicIcon aria-hidden="true" className="size-3" />
            Dictated{heard && ` ${heard}`}
          </span>
          {when && <span aria-hidden="true">·</span>}
        </>
      )}
      {when && (
        <time dateTime={note.createdAt} title={Number.isNaN(date.getTime()) ? undefined : date.toLocaleString()}>
          {when}
        </time>
      )}
    </p>
  )
}

function SortCard({ note, tour, actions }: { note: InboxNote; tour: boolean; actions: NoteActions }) {
  const db = usePowerSync()
  const when = noteWhen(note.createdAt)
  const preview = notePreview(note.text) || "Empty note"
  return (
    <li
      className="rounded-xl border border-border bg-card p-2 shadow-xs sm:p-3"
      data-inbox-note={note.id}
      data-tour={tour ? "inbox-note" : undefined}
    >
      <DraftTextarea
        value={note.text}
        onSave={(text) => updateNoteText(db, note.id, text)}
        aria-label={when ? `Note, ${when}` : "Note"}
        placeholder="An empty note"
        className="max-h-72 min-h-0 resize-none border-transparent bg-transparent px-2 py-1.5 shadow-none hover:border-input pointer-coarse:min-h-11 dark:bg-transparent"
        data-inbox-text={note.id}
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-2">
        <NoteMeta note={note} />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-inbox-file={note.id}
            onClick={(event) => actions.file(note, event.currentTarget)}
          >
            <FolderInputIcon aria-hidden="true" />
            <span>
              File<span className="sr-only"> “{preview}”</span>…
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-inbox-world={note.id}
            onClick={(event) => actions.makeEntry(note, event.currentTarget)}
          >
            <BookPlusIcon aria-hidden="true" />
            <span>
              Add<span className="sr-only"> “{preview}”</span> to World
            </span>
          </Button>
          <NoteMenu note={note} list="sort" preview={preview} actions={actions} />
        </div>
      </div>
    </li>
  )
}

function FiledCard({
  bookId,
  note,
  places,
  actions,
}: {
  bookId: string
  note: InboxNote
  places: Places
  actions: NoteActions
}) {
  const filedTo = note.filedTo
  if (!filedTo) return null
  const place = filedPlace(filedTo, places)
  const preview = notePreview(note.text) || "Empty note"
  const link =
    place === null
      ? null
      : filedTo.kind === "chapter"
        ? { to: `/b/${bookId}/plan?chapter=${filedTo.id}`, label: "Show in Plan" }
        : { to: codexPath(bookId, filedTo.id), label: "Show in World" }
  return (
    <li className="rounded-xl border border-border bg-card/60 p-3 sm:p-4" data-inbox-filed={note.id}>
      <p className="text-sm break-words whitespace-pre-wrap text-ink-2">{note.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground" data-inbox-filing="">
          <CheckIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {filingText(filedTo, place)}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {link && (
            <Button asChild variant="ghost" size="sm">
              <Link to={link.to} data-inbox-open={note.id}>
                {link.label}
              </Link>
            </Button>
          )}
          <NoteMenu note={note} list="filed" preview={preview} actions={actions} />
        </div>
      </div>
    </li>
  )
}

function NoteMenu({
  note,
  list,
  preview,
  actions,
}: {
  note: InboxNote
  list: List
  preview: string
  actions: NoteActions
}) {
  const menu = useAfterMenu()
  return (
    <DeferredMenu
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`More for “${preview}”`}
          data-inbox-menu={note.id}
          className="text-muted-foreground"
        >
          <EllipsisIcon />
        </Button>
      }
    >
      <DropdownMenuContent align="end" className="w-64" onCloseAutoFocus={menu.onCloseAutoFocus}>
        {list === "filed" && (
          <DropdownMenuItem onSelect={() => menu.after(() => actions.moveBack(note))} data-inbox-move-back="">
            <Undo2Icon />
            <span className="grid">
              Move back to To sort
              <span className="text-xs text-muted-foreground">What was filed stays where it went.</span>
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void copyText(note.text)}>
          <CopyIcon />
          Copy text
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => menu.after(() => actions.remove(note, list))}
          data-inbox-delete=""
        >
          <Trash2Icon />
          Delete note
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DeferredMenu>
  )
}
