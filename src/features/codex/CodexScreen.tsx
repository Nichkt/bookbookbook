import { usePowerSync } from "@powersync/react"
import { EllipsisIcon, PencilIcon, PlusIcon, SearchIcon, ShapesIcon, Trash2Icon } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react"
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router"
import { rememberBook, useCurrentBook } from "@/app/books"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { PlaceholderScreen } from "@/app/PlaceholderScreens"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAfterMenu } from "@/components/useAfterMenu"
import type { PaletteCommand } from "@/features/palette/commands"
import { usePaletteSource } from "@/features/palette/paletteStore"
import { byData, focusPending, focusSoon, nothingFocused } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { nextColor } from "@/lib/palette"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { codexPath, useCodex, type Codex, type CodexEntry, type CodexType } from "./codexData"
import { Portrait, TypeIcon } from "./CodexIcons"
import {
  entryLabel,
  isFiltering,
  isStayState,
  listEntries,
  neighborOf,
  NO_FILTER,
  NO_TYPE,
  nounOf,
  readLastEntry,
  readList,
  resolveList,
  saveLastEntry,
  saveList,
  SPLIT_QUERY,
  STAY_STATE,
  typeNameError,
  WIDE_QUERY,
  type BackLink,
  type CodexLayout,
  type ListFilter,
} from "./screenRules"
import { EntryPage } from "./EntryPage"
import { createCustomType, createEntry, deleteType, renameType, trashEntry } from "./mutations"
import { useAppearances } from "./useAppearances"

/** An entry that just vanished (trashed elsewhere) gets a moment to come back before saying so. */
const MISSING_DELAY_MS = 600

/** Select values can't be "": these stand for the list of entries without a type, and for every tag. */
const NO_TYPE_VALUE = "*none*"
const ALL_TAGS = "*all*"

const ROW =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const ACTIVE_ROW = "bg-accent font-medium text-ink"

const entriesText = (count: number) => `${formatCount(count)} ${count === 1 ? "entry" : "entries"}`

/** `/b/:bookId/world/:entryId?`: the World screen (DESIGN.md §7), called the codex in the code. */
export function CodexScreen() {
  const { bookId = "" } = useParams()
  return <CodexBook key={bookId} bookId={bookId} />
}

function CodexBook({ bookId }: { bookId: string }) {
  const { book, isLoading: booksLoading } = useCurrentBook()
  const codex = useCodex(bookId)
  if (booksLoading || codex.isLoading) return null
  if (!book) {
    return (
      <PlaceholderScreen title="Book not found" milestone="World">
        <p>It may have been deleted. Pick another book from the book menu above, or restore it from the Trash there.</p>
      </PlaceholderScreen>
    )
  }
  return <CodexWorkspace bookId={bookId} codex={codex} />
}

/** The World's part of the command palette (DESIGN.md §4): a new entry in the list showing, and a new type. */
function worldCommands(listType: CodexType | undefined, actions: ListActions): PaletteCommand[] {
  const commands: PaletteCommand[] = []
  if (listType) {
    commands.push({
      id: "world:new-entry",
      label: `New ${nounOf(listType.singular)}`,
      group: "Actions",
      icon: PlusIcon,
      keywords: ["add", "create", "new entry", listType.name],
      movesFocus: true,
      run: actions.newEntry,
    })
  }
  commands.push({
    id: "world:new-type",
    label: "New type?",
    group: "Actions",
    icon: ShapesIcon,
    keywords: ["add a type", "kind of entry", "category", "create"],
    run: (from) => actions.openTypeDialog(null, from),
  })
  return commands
}

interface TypeDialogState {
  open: boolean
  /** The type being renamed; null for a new one. */
  typeId: string | null
  /** Bumped on every opening, so the form starts afresh. */
  session: number
  returnFocus: HTMLElement | null
  /** Where focus goes once the dialog has closed, in place of `returnFocus`. */
  focusAfter: string | null
}

const CLOSED_DIALOG: TypeDialogState = { open: false, typeId: null, session: 0, returnFocus: null, focusAfter: null }

/** What the list's controls can do. */
interface ListActions {
  pickList: (list: string) => void
  newEntry: () => void
  openTypeDialog: (typeId: string | null, returnFocus: HTMLElement | null) => void
  deleteType: (type: CodexType) => void
}

function CodexWorkspace({ bookId, codex }: { bookId: string; codex: Codex }) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const location = useLocation()
  const { entryId } = useParams()
  const wide = useMediaQuery(WIDE_QUERY)
  const split = useMediaQuery(SPLIT_QUERY)
  const layout: CodexLayout = wide ? "wide" : split ? "split" : "phone"
  const appearances = useAppearances(bookId)
  const entry = entryId ? codex.entryById.get(entryId) : undefined

  // The list follows the entry on screen, so its row is there to come back to.
  const entryKey = entry ? `${entry.id}:${entry.typeId ?? NO_TYPE}` : null
  const [syncedKey, setSyncedKey] = useState(entryKey)
  const [wantedList, setWantedList] = useState(() => (entry ? (entry.typeId ?? NO_TYPE) : readList(bookId)))
  if (entryKey !== syncedKey) {
    setSyncedKey(entryKey)
    if (entry) setWantedList(entry.typeId ?? NO_TYPE)
  }
  const list = resolveList(codex, wantedList)
  const listName = list === NO_TYPE ? "No type" : (codex.typeById.get(list)?.name ?? "No type")

  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const query = filter.query
  const wantedTag = filter.tag?.toLowerCase()
  // A tag nobody uses anymore stops filtering.
  const tag = wantedTag === undefined ? null : (codex.tags.find((candidate) => candidate.toLowerCase() === wantedTag) ?? null)
  const filtering = isFiltering({ query, tag })
  const entries = useMemo(() => listEntries(codex, list, { query, tag }), [codex, list, query, tag])

  const [creating, setCreating] = useState(false)
  const [dialog, setDialog] = useState<TypeDialogState>(CLOSED_DIALOG)
  const editingType = dialog.typeId ? codex.typeById.get(dialog.typeId) : undefined

  useEffect(() => {
    rememberBook(bookId, "world")
  }, [bookId])

  useEffect(() => {
    saveList(bookId, list)
  }, [bookId, list])

  const shownId = entry?.id
  useEffect(() => {
    if (shownId) saveLastEntry(bookId, shownId)
  }, [bookId, shownId])

  // On arrival a link to an entry selects its row (DESIGN.md §17); on phones, where the entry fills the screen, its
  // heading. Back on a phone's list, the entry that was open.
  useEffect(() => {
    window.scrollTo(0, 0)
    if (focusPending() || !nothingFocused()) return
    if (entryId) {
      focusSoon(byData(layout === "phone" ? "codex-heading" : "codex-row", entryId))
    } else if (layout === "phone") {
      const last = readLastEntry(bookId)
      if (last && entries.some((candidate) => candidate.id === last)) focusSoon(byData("codex-row", last))
    }
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps -- on arrival only

  const pickList = (next: string) => {
    setFilter(NO_FILTER)
    setWantedList(next)
    if (layout === "phone") return
    // The open entry stays open if it's in that list.
    if (entry && (entry.typeId ?? NO_TYPE) === next) return
    const first = codex.entriesByType.get(next)?.[0]
    if (first) navigate(codexPath(bookId, first.id))
    else navigate(codexPath(bookId), { state: STAY_STATE })
  }

  const newEntry = async () => {
    if (creating || list === NO_TYPE) return
    setCreating(true)
    const color = nextColor((codex.entriesByType.get(list) ?? []).map((candidate) => candidate.color))
    const id = await attempt("new entry", createEntry(db, { bookId, typeId: list, name: "", color }))
    setCreating(false)
    if (!id) return
    setFilter(NO_FILTER)
    navigate(codexPath(bookId, id))
    focusSoon(byData("codex-name", id))
  }

  const trash = async (target: CodexEntry) => {
    const next = neighborOf(entries, target.id)
    const changes = await attempt("trash entry", trashEntry(db, target.id))
    if (!changes) return
    if (layout === "phone" || !next) navigate(codexPath(bookId), { replace: true, state: STAY_STATE })
    else navigate(codexPath(bookId, next.id), { replace: true })
    focusSoon(
      next
        ? byData("codex-row", next.id)
        : layout === "wide"
          ? "[data-codex-list-heading]"
          : "[data-codex-type-select]",
    )
    const singular = target.typeId ? codex.typeById.get(target.typeId)?.singular : undefined
    offerUndo(db, `Moved ${entryLabel(target, singular)} to the Trash`, changes, () => {
      if (!window.location.pathname.startsWith(codexPath(bookId))) return
      navigate(codexPath(bookId, target.id))
      focusSoon(byData(layout === "phone" ? "codex-heading" : "codex-row", target.id))
    })
  }

  const openTypeDialog = (typeId: string | null, returnFocus: HTMLElement | null) =>
    setDialog((current) => ({ open: true, typeId, session: current.session + 1, returnFocus, focusAfter: null }))

  const closeTypeDialog = (focusAfter: string | null = null) =>
    setDialog((current) => ({ ...current, open: false, focusAfter }))

  const submitType = async (name: string) => {
    if (editingType) {
      if (name !== editingType.name) {
        const saved = await attempt("rename type", renameType(db, editingType.id, name).then(() => true))
        if (!saved) return
      }
      closeTypeDialog()
      return
    }
    const id = await attempt("new type", createCustomType(db, { bookId, name }))
    if (!id) return
    closeTypeDialog("[data-codex-new]")
    pickList(id)
  }

  const removeType = async (type: CodexType) => {
    const changes = await attempt("delete type", deleteType(db, type.id))
    if (!changes) return
    let shown = list
    if (list === type.id) {
      shown = codex.types.find((candidate) => candidate.id !== type.id)?.id ?? NO_TYPE
      pickList(shown)
    }
    focusSoon(layout === "wide" ? byData("codex-type", shown) : "[data-codex-type-select]")
    offerUndo(db, `Deleted the type “${type.name}”`, changes, () => {
      if (!window.location.pathname.startsWith(codexPath(bookId))) return
      pickList(type.id)
      focusSoon(layout === "wide" ? byData("codex-type", type.id) : "[data-codex-type-select]")
    })
  }

  const actions: ListActions = {
    pickList,
    newEntry: () => void newEntry(),
    openTypeDialog,
    deleteType: (type) => void removeType(type),
  }

  usePaletteSource("world", { commands: () => worldCommands(codex.typeById.get(list), actions) })

  if (layout !== "phone" && !entryId && !isStayState(location.state)) {
    const last = readLastEntry(bookId)
    const target = entries.find((candidate) => candidate.id === last) ?? entries[0]
    if (target) return <Navigate to={codexPath(bookId, target.id)} replace />
  }

  const listTitle = filtering ? "Search results" : listName
  const back: BackLink | null = layout === "phone" ? { to: codexPath(bookId), label: listTitle } : null
  const listType = codex.typeById.get(list)

  let pane: ReactNode
  if (entry) {
    pane = (
      <EntryPage
        key={entry.id}
        bookId={bookId}
        codex={codex}
        entry={entry}
        appearances={appearances}
        back={back}
        onTrash={(target) => void trash(target)}
      />
    )
  } else if (entryId) {
    pane = <MissingEntry key={entryId} back={back} />
  } else if (entries.length === 0 && !filtering && listType) {
    pane = (
      <EmptyPane
        title={`No ${nounOf(listType.name)} yet`}
        action={
          <Button onClick={actions.newEntry} disabled={creating}>
            <PlusIcon />
            New {nounOf(listType.singular)}
          </Button>
        }
      >
        Give each one a page for its details and notes, and see the chapters it appears in.
      </EmptyPane>
    )
  } else {
    pane = (
      <EmptyPane title="No entry open">
        {filtering ? "Pick one from the search results." : `Pick ${listType ? `a ${nounOf(listType.singular)}` : "an entry"} from the list.`}
      </EmptyPane>
    )
  }

  const listPane = (
    <ListPane
      layout={layout}
      bookId={bookId}
      codex={codex}
      list={list}
      title={listTitle}
      entries={entries}
      query={query}
      tag={tag}
      filtering={filtering}
      currentId={entry?.id}
      creating={creating}
      setFilter={setFilter}
      actions={actions}
    />
  )

  return (
    <div className="flex flex-1 items-start">
      <h1 className="sr-only">World</h1>
      {layout === "wide" && <TypeNav codex={codex} list={list} filtering={filtering} actions={actions} />}
      {layout === "phone" ? (
        <div className="min-w-0 flex-1">{entryId ? pane : listPane}</div>
      ) : (
        <>
          {listPane}
          <div className="min-w-0 flex-1 self-stretch">{pane}</div>
        </>
      )}
      <Dialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) closeTypeDialog()
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            if (dialog.focusAfter) {
              event.preventDefault()
              focusSoon(dialog.focusAfter)
            } else if (dialog.returnFocus?.isConnected) {
              event.preventDefault()
              dialog.returnFocus.focus()
            }
          }}
        >
          <TypeForm key={dialog.session} type={editingType} types={codex.types} onSubmit={submitType} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The types, beside the list on wide screens. */
function TypeNav({
  codex,
  list,
  filtering,
  actions,
}: {
  codex: Codex
  list: string
  filtering: boolean
  actions: ListActions
}) {
  const row = (id: string, name: string, icon: string | null) => {
    const count = codex.entriesByType.get(id)?.length ?? 0
    const current = !filtering && id === list
    return (
      <li key={id}>
        <button
          type="button"
          data-codex-type={id}
          aria-current={current ? "true" : undefined}
          aria-label={`${name}, ${entriesText(count)}`}
          onClick={() => actions.pickList(id)}
          className={cn(ROW, "w-full text-left", current && ACTIVE_ROW)}
        >
          <TypeIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{formatCount(count)}</span>
        </button>
      </li>
    )
  }

  return (
    <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] w-56 shrink-0 flex-col border-r bg-surface">
      <nav aria-label="Entry types" data-tour="world-types" className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {codex.types.map((type) => row(type.id, type.name, type.icon))}
          {codex.entriesByType.has(NO_TYPE) && row(NO_TYPE, "No type", null)}
        </ul>
      </nav>
      <div className="shrink-0 border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => actions.openTypeDialog(null, event.currentTarget)}
          className="w-full justify-start text-ink-2"
        >
          <PlusIcon />
          New type
        </Button>
      </div>
    </div>
  )
}

interface ListPaneProps {
  layout: CodexLayout
  bookId: string
  codex: Codex
  list: string
  title: string
  entries: readonly CodexEntry[]
  query: string
  tag: string | null
  filtering: boolean
  currentId: string | undefined
  creating: boolean
  setFilter: Dispatch<SetStateAction<ListFilter>>
  actions: ListActions
}

/** A type's entries, or what a search or tag found across every type. */
function ListPane({
  layout,
  bookId,
  codex,
  list,
  title,
  entries,
  query,
  tag,
  filtering,
  currentId,
  creating,
  setFilter,
  actions,
}: ListPaneProps) {
  const headingId = useId()
  const scroller = useRef<HTMLDivElement>(null)
  const type = codex.typeById.get(list)

  // Keeps the open entry's row in view. Not scrollIntoView, which would scroll the page too.
  useEffect(() => {
    const box = scroller.current
    const row = box?.querySelector('[aria-current="page"]')
    if (!box || !row || layout === "phone") return
    const outer = box.getBoundingClientRect()
    const rect = row.getBoundingClientRect()
    if (rect.top < outer.top) box.scrollTop += rect.top - outer.top - 8
    else if (rect.bottom > outer.bottom) box.scrollTop += rect.bottom - outer.bottom + 8
  }, [currentId, layout])

  const clearFilter = () => {
    setFilter(NO_FILTER)
    focusSoon("[data-codex-search]")
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        layout !== "phone" && "sticky top-14 h-[calc(100svh-3.5rem)] w-80 shrink-0 border-r bg-surface",
      )}
    >
      <div className="grid shrink-0 gap-2 border-b p-3">
        <div className="flex items-center gap-1">
          {layout === "wide" ? (
            <h2
              id={headingId}
              tabIndex={-1}
              data-codex-list-heading
              className="mr-auto min-w-0 truncate rounded-sm font-heading text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {title}
            </h2>
          ) : (
            <>
              <h2 id={headingId} className="sr-only">
                {title}
              </h2>
              <TypeSelect codex={codex} list={list} filtering={filtering} onPick={actions.pickList} />
            </>
          )}
          <TypeMenu
            type={type}
            count={codex.entriesByType.get(list)?.length ?? 0}
            withNew={layout !== "wide"}
            actions={actions}
          />
          {type && (
            <Button
              data-codex-new
              data-tour="world-new"
              size="sm"
              variant="outline"
              aria-label={`New ${nounOf(type.singular)}`}
              title={`New ${nounOf(type.singular)}`}
              disabled={creating}
              onClick={actions.newEntry}
              className="shrink-0"
            >
              <PlusIcon />
              New
            </Button>
          )}
        </div>
        <div data-tour="world-search" className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              data-codex-search
              aria-label="Search your world"
              placeholder="Search"
              value={query}
              onChange={(event) => {
                const next = event.target.value
                setFilter((current) => ({ ...current, query: next }))
              }}
              className="pl-8"
            />
          </div>
          {codex.tags.length > 0 && (
            <Select
              value={tag === null ? ALL_TAGS : `#${tag}`}
              onValueChange={(value) => setFilter((current) => ({ ...current, tag: value === ALL_TAGS ? null : value.slice(1) }))}
            >
              <SelectTrigger aria-label="Filter by tag" className="w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value={ALL_TAGS}>All tags</SelectItem>
                {codex.tags.map((option) => (
                  <SelectItem key={option} value={`#${option}`}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p role="status" className="sr-only">
          {filtering ? `${entriesText(entries.length)} found` : ""}
        </p>
      </div>
      <div ref={scroller} className={cn(layout !== "phone" && "min-h-0 flex-1 overflow-y-auto")}>
        {entries.length > 0 ? (
          <ul aria-labelledby={headingId} data-tour="world-list" className="space-y-0.5 p-2">
            {entries.map((entry) => {
              const current = entry.id === currentId
              const typeName = entry.typeId ? codex.typeById.get(entry.typeId)?.singular : "No type"
              const subtitle = [filtering ? typeName : null, entry.aliases.join(", ")].filter(Boolean).join(" · ")
              return (
                <li key={entry.id}>
                  <Link
                    to={codexPath(bookId, entry.id)}
                    data-codex-row={entry.id}
                    aria-current={current ? "page" : undefined}
                    className={cn(ROW, current && ACTIVE_ROW)}
                  >
                    <Portrait entry={entry} className="size-7 text-[0.6875rem]" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", !entry.named && "text-muted-foreground italic")}>
                        {entry.name}
                      </span>
                      {subtitle && (
                        <span className="block truncate text-xs font-normal text-muted-foreground">{subtitle}</span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="grid justify-items-start gap-2 p-4 text-sm text-muted-foreground">
            {filtering ? (
              <>
                <p>No entries match.</p>
                <Button variant="outline" size="sm" onClick={clearFilter}>
                  Clear search
                </Button>
              </>
            ) : (
              <p>No {nounOf(title)} yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Which type's entries the list shows, on screens too narrow for the types beside it. */
function TypeSelect({
  codex,
  list,
  filtering,
  onPick,
}: {
  codex: Codex
  list: string
  filtering: boolean
  onPick: (list: string) => void
}) {
  // A search looks through every type, so none is picked meanwhile.
  const value = filtering ? "" : list === NO_TYPE ? NO_TYPE_VALUE : list
  return (
    <Select value={value} onValueChange={(next) => onPick(next === NO_TYPE_VALUE ? NO_TYPE : next)}>
      <SelectTrigger
        aria-label="Entry type"
        data-codex-type-select
        data-tour="world-types"
        className="mr-auto min-w-0 flex-1"
      >
        <SelectValue placeholder="All types" />
      </SelectTrigger>
      <SelectContent position="popper">
        {codex.types.map((type) => (
          <SelectItem key={type.id} value={type.id}>
            <TypeIcon icon={type.icon} className="text-muted-foreground" />
            {type.name}
          </SelectItem>
        ))}
        {codex.entriesByType.has(NO_TYPE) && (
          <SelectItem value={NO_TYPE_VALUE}>
            <TypeIcon icon={null} className="text-muted-foreground" />
            No type
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

/** New type (where the types aren't listed beside it), and Rename and Delete for a type of the writer's own. */
function TypeMenu({
  type,
  count,
  withNew,
  actions,
}: {
  type: CodexType | undefined
  count: number
  withNew: boolean
  actions: ListActions
}) {
  const menu = useAfterMenu()
  const trigger = useRef<HTMLButtonElement>(null)
  const custom = type && !type.builtin ? type : undefined
  if (!withNew && !custom) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="icon-sm"
          aria-label={custom ? `More for ${custom.name}` : "More for types"}
          className="shrink-0 text-muted-foreground"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={menu.onCloseAutoFocus}>
        {withNew && (
          <DropdownMenuItem onSelect={() => menu.after(() => actions.openTypeDialog(null, trigger.current))}>
            <PlusIcon />
            New type…
          </DropdownMenuItem>
        )}
        {withNew && custom && <DropdownMenuSeparator />}
        {custom && (
          <>
            <DropdownMenuItem onSelect={() => menu.after(() => actions.openTypeDialog(custom.id, trigger.current))}>
              <PencilIcon />
              Rename “{custom.name}”…
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={count > 0}
              onSelect={() => menu.after(() => actions.deleteType(custom))}
            >
              <Trash2Icon />
              <span className="grid">
                Delete “{custom.name}”
                {count > 0 && <span className="text-xs text-muted-foreground">Only an empty type can be deleted.</span>}
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** New type, or Rename: a name that no other type has. */
function TypeForm({
  type,
  types,
  onSubmit,
}: {
  type: CodexType | undefined
  types: readonly CodexType[]
  onSubmit: (name: string) => Promise<void>
}) {
  const id = useId()
  const [name, setName] = useState(type?.name ?? "")
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const error = typeNameError(name, types, type?.id ?? null)
  // A clash shows as you type; a blank name only once you try it.
  const showError = error !== null && (tried || name.trim() !== "")

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setTried(true)
    if (error) {
      announce(error)
      return
    }
    setBusy(true)
    await onSubmit(name.trim())
    setBusy(false)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{type ? "Rename type" : "New type"}</DialogTitle>
        <DialogDescription>
          {type
            ? "Its entries keep their fields."
            : "A kind of entry of your own, like ships or spells. Its entries start without fields: add the ones you need as you go."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          autoFocus
          autoComplete="off"
          placeholder="Ships"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-error` : `${id}-help`}
        />
        {showError ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            In the plural, as the list is headed.
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          {type ? "Rename" : "Create type"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function EmptyPane({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h2 className="font-heading text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

function MissingEntry({ back }: { back: BackLink | null }) {
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMissing(true), MISSING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!missing) return null
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h2 className="font-heading text-2xl font-semibold text-ink">This entry isn't here</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        It may have been moved to the Trash. Restore it from the Trash in the book menu.
      </p>
      {back && (
        <Link
          to={back.to}
          className="mt-4 inline-flex items-center text-sm text-ink underline underline-offset-2 pointer-coarse:min-h-11"
        >
          Back to {back.label}
        </Link>
      )}
    </div>
  )
}
