import { useQuery } from "@powersync/react"
import { ChevronLeftIcon, SearchIcon, XIcon } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Portrait, TypeIcon } from "@/features/codex/CodexIcons"
import { codexPath, entryMatches, useCodex, type Codex, type CodexEntry } from "@/features/codex/codexData"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import {
  CHAPTER_LINKS_SQL,
  chapterEntries,
  chapterEntryText,
  CODEX_PANEL_LIST_HEADING,
  CODEX_PANEL_SEARCH,
  filledFields,
  PANEL_SCROLLER,
  typeGroups,
  type ChapterEntry,
  type ChapterLinkRow,
} from "./codexPanelData"
import { useChapterMentions } from "./useChapterMentions"
import { useWrite } from "./writeContext"

const HEADER = "sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-surface/95 px-4 backdrop-blur"
const FOCUS_RING = "rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const ROW =
  "flex w-full scroll-mt-14 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const LINK_BUTTON = cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-ink-2")

const NO_MENTIONS: ReadonlyMap<string, number> = new Map()

/** Where a row sits. An entry in the chapter has two rows: there and in its type's group. */
type RowPlace = "chapter" | "type" | "search"

const rowSelector = (id: string, place: string) => byData("codex-panel-row", id) + byData("codex-panel-place", place)

/**
 * Where Back lands: the entry's row it was opened from, or else its row in view, or its first. The list's heading
 * when the search leaves it out.
 */
function landingRow(root: HTMLElement, scroller: Element, id: string, place: RowPlace | null): string {
  const rows = [...root.querySelectorAll<HTMLElement>(byData("codex-panel-row", id))]
  const box = scroller.getBoundingClientRect()
  const inView = (row: HTMLElement) => {
    const rect = row.getBoundingClientRect()
    return rect.bottom > box.top && rect.top < box.bottom
  }
  const row = rows.find((row) => row.dataset.codexPanelPlace === place) ?? rows.find(inView) ?? rows[0]
  return row ? rowSelector(id, row.dataset.codexPanelPlace ?? "") : CODEX_PANEL_LIST_HEADING
}

const entriesText = (count: number) => `${formatCount(count)} ${count === 1 ? "entry" : "entries"}`

/**
 * The codex beside the text (DESIGN.md §7, §8): the entries the chapter names, then all of them by type, and one at a
 * time to read. Editing them stays on the World screen.
 */
export function CodexPanel({ onClose }: { onClose: () => void }) {
  const { bookId, plan, chapterId, matcher, codexEntryId, setCodexEntryId } = useWrite()
  const codex = useCodex(bookId)
  const chapter = plan.chapterById.get(chapterId)
  const sceneIds = useMemo(() => chapter?.scenes.map((scene) => scene.id) ?? [], [chapter])
  const mentions = useChapterMentions(chapterId, sceneIds, matcher)
  const links = useQuery<ChapterLinkRow>(CHAPTER_LINKS_SQL, [chapterId, chapterId, chapterId, chapterId])
  const counts = mentions.counts ?? (mentions.failed ? NO_MENTIONS : null)
  const inChapter = useMemo(
    () => (counts && !links.isLoading && !codex.isLoading ? chapterEntries(codex, counts, links.data) : null),
    [codex, counts, links.data, links.isLoading],
  )
  const [query, setQuery] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const listScroll = useRef(0)
  const listShown = useRef(false)
  /** The row the entry showing was opened from. Details on a name in the text opens one from nowhere. */
  const openedFrom = useRef<{ id: string; place: RowPlace } | null>(null)
  /** The entry Back is leaving, to land on once the list is back. */
  const leaving = useRef<{ id: string; place: RowPlace | null } | null>(null)

  // An entry gone to the Trash shows the list. One still loading shows nothing for a moment, rather than the list,
  // whose heading would take the focus meant for the entry's.
  const entry = codexEntryId ? codex.entryById.get(codexEntryId) : undefined
  const view = entry?.id ?? (codexEntryId && codex.isLoading ? null : "list")

  // An entry opens at its top; the list comes back where it was left.
  useLayoutEffect(() => {
    const scroller = root.current?.closest(PANEL_SCROLLER)
    listShown.current = view === "list"
    if (scroller) scroller.scrollTop = view === "list" ? listScroll.current : 0
    const left = leaving.current
    leaving.current = null
    if (view === "list" && left && root.current && scroller) {
      focusSoon(landingRow(root.current, scroller, left.id, left.place))
    }
  }, [view])

  // Followed as it scrolls, since Details can open an entry over the list too.
  useEffect(() => {
    const scroller = root.current?.closest(PANEL_SCROLLER)
    if (!scroller) return
    const onScroll = () => {
      if (listShown.current) listScroll.current = scroller.scrollTop
    }
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", onScroll)
  }, [])

  const openEntry = (id: string, place: RowPlace) => {
    listScroll.current = root.current?.closest(PANEL_SCROLLER)?.scrollTop ?? 0
    openedFrom.current = { id, place }
    setCodexEntryId(id)
    focusSoon(byData("codex-panel-heading", id))
  }
  const back = (from: CodexEntry) => {
    const opened = openedFrom.current
    openedFrom.current = null
    leaving.current = { id: from.id, place: opened?.id === from.id ? opened.place : null }
    setCodexEntryId(null)
  }

  return (
    <div ref={root} className="flex flex-col">
      {entry && (
        <EntryView
          bookId={bookId}
          codex={codex}
          entry={entry}
          item={inChapter?.find((item) => item.entry.id === entry.id)}
          counted={inChapter !== null}
          onBack={() => back(entry)}
          onClose={onClose}
        />
      )}
      {view === "list" && (
        <ListView
          bookId={bookId}
          codex={codex}
          inChapter={inChapter}
          countFailed={mentions.failed}
          query={query}
          setQuery={setQuery}
          onOpen={openEntry}
          onClose={onClose}
        />
      )}
    </div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose} className="text-muted-foreground">
      <XIcon />
    </Button>
  )
}

interface ListViewProps {
  bookId: string
  codex: Codex & { isLoading: boolean }
  /** Null until the chapter's names are counted. */
  inChapter: ChapterEntry[] | null
  countFailed: boolean
  query: string
  setQuery: (query: string) => void
  onOpen: (entryId: string, place: RowPlace) => void
  onClose: () => void
}

function ListView({ bookId, codex, inChapter, countFailed, query, setQuery, onOpen, onClose }: ListViewProps) {
  const results = useMemo(
    () => (query.trim() ? codex.entries.filter((entry) => entryMatches(entry, query)) : null),
    [codex.entries, query],
  )
  const groups = useMemo(() => typeGroups(codex), [codex])
  const typeName = (entry: CodexEntry) => (entry.typeId && codex.typeById.get(entry.typeId)?.singular) || "No type"

  const clearSearch = () => {
    setQuery("")
    focusSoon(CODEX_PANEL_SEARCH)
  }

  let body: ReactNode = null
  if (codex.isLoading) {
    body = null
  } else if (codex.entries.length === 0) {
    body = (
      <div className="grid justify-items-start gap-2 text-sm text-muted-foreground">
        <p>Your world is empty. The characters, places and things you add in World show up here as you write.</p>
        <Link to={codexPath(bookId)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Go to World
        </Link>
      </div>
    )
  } else if (results) {
    body =
      results.length > 0 ? (
        <ul aria-label="Search results" className="-mx-2 grid gap-0.5">
          {results.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              place="search"
              subtitle={[typeName(entry), entry.aliases.join(", ")].filter(Boolean).join(" · ")}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : (
        <div className="grid justify-items-start gap-2 text-sm text-muted-foreground">
          <p>No entries match.</p>
          <Button variant="outline" size="sm" onClick={clearSearch}>
            Clear search
          </Button>
        </div>
      )
  } else {
    body = (
      <>
        <Group heading="In this chapter">
          {inChapter && inChapter.length > 0 && (
            <ul className="-mx-2 grid gap-0.5">
              {inChapter.map((item) => (
                <EntryRow
                  key={item.entry.id}
                  entry={item.entry}
                  place="chapter"
                  subtitle={chapterEntryText(item)}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          )}
          {inChapter?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No names from your world in this chapter yet. Entries its text mentions, or its plan links, show up here.
            </p>
          )}
          {countFailed && (
            <p className="text-sm text-muted-foreground">
              Couldn’t count mentions in the text, so only the plan’s links are listed.
            </p>
          )}
        </Group>
        {groups.map(({ type, entries }) => (
          <Group
            key={type?.id ?? ""}
            heading={type?.name ?? "No type"}
            icon={<TypeIcon icon={type?.icon ?? null} className="size-3.5 shrink-0" />}
          >
            <ul className="-mx-2 grid gap-0.5">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  place="type"
                  subtitle={entry.aliases.join(", ")}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          </Group>
        ))}
      </>
    )
  }

  return (
    <>
      <header className={HEADER}>
        <h2
          tabIndex={-1}
          data-codex-panel-heading="list"
          className={cn("mr-auto text-xs font-semibold tracking-widest text-muted-foreground uppercase", FOCUS_RING)}
        >
          World
        </h2>
        <Link to={codexPath(bookId)} className={LINK_BUTTON}>
          Open in World
        </Link>
        <CloseButton onClose={onClose} />
      </header>
      <div className="grid gap-5 px-4 pt-3 pb-8">
        {codex.entries.length > 0 && (
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              data-codex-panel-search
              aria-label="Search your world"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
            />
            <p role="status" className="sr-only">
              {results ? `${entriesText(results.length)} found` : ""}
            </p>
          </div>
        )}
        {body}
      </div>
    </>
  )
}

function Group({ heading, icon, children }: { heading: string; icon?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid gap-1.5">
      <h3 id={id} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {heading}
      </h3>
      {children}
    </section>
  )
}

interface EntryRowProps {
  entry: CodexEntry
  place: RowPlace
  subtitle: string
  onOpen: (id: string, place: RowPlace) => void
}

function EntryRow({ entry, place, subtitle, onOpen }: EntryRowProps) {
  return (
    <li>
      <button
        type="button"
        data-codex-panel-row={entry.id}
        data-codex-panel-place={place}
        onClick={() => onOpen(entry.id, place)}
        className={ROW}
      >
        <Portrait entry={entry} className="size-7 text-[0.6875rem]" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", !entry.named && "text-muted-foreground italic")}>{entry.name}</span>
          {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
      </button>
    </li>
  )
}

interface EntryViewProps {
  bookId: string
  codex: Codex
  entry: CodexEntry
  /** The entry's part in the chapter, if it has one. */
  item: ChapterEntry | undefined
  /** Whether the chapter's names have been counted, so no item means it isn't in the chapter. */
  counted: boolean
  onBack: () => void
  onClose: () => void
}

function EntryView({ bookId, codex, entry, item, counted, onBack, onClose }: EntryViewProps) {
  const notesId = useId()
  const type = entry.typeId ? codex.typeById.get(entry.typeId) : undefined
  const fields = filledFields(entry, type)
  let chapterLine: string | null = null
  if (item) chapterLine = `In this chapter: ${chapterEntryText(item)}`
  else if (counted) chapterLine = "Not in this chapter yet."

  return (
    <>
      <header className={HEADER}>
        <Button variant="ghost" size="sm" onClick={onBack} className="mr-auto -ml-2 text-ink-2">
          <ChevronLeftIcon />
          Back
        </Button>
        <Link to={codexPath(bookId, entry.id)} className={LINK_BUTTON}>
          Open in World
        </Link>
        <CloseButton onClose={onClose} />
      </header>
      <div className="grid gap-4 px-4 pt-4 pb-8">
        <div className="flex items-center gap-3">
          <Portrait entry={entry} className="size-12 text-base" />
          <div className="min-w-0">
            <h2
              tabIndex={-1}
              data-codex-panel-heading={entry.id}
              className={cn(
                "scroll-mt-16 font-heading text-xl font-semibold break-words text-ink",
                !entry.named && "text-muted-foreground italic",
                FOCUS_RING,
              )}
            >
              {entry.name}
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TypeIcon icon={type?.icon ?? null} className="size-3.5 shrink-0" />
              {type?.singular ?? "No type"}
            </p>
          </div>
        </div>
        {entry.tags.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-ink-2">
                {tag}
              </li>
            ))}
          </ul>
        )}
        {(entry.aliases.length > 0 || chapterLine) && (
          <div className="grid gap-1 text-sm text-ink-2">
            {entry.aliases.length > 0 && <p>Also called {entry.aliases.join(", ")}</p>}
            {chapterLine && <p>{chapterLine}</p>}
          </div>
        )}
        {fields.length > 0 && (
          <dl className="grid gap-3">
            {fields.map(({ label, value }) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="text-sm whitespace-pre-wrap text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {entry.notes.trim() && (
          <section aria-labelledby={notesId} className="grid gap-0.5">
            <h3 id={notesId} className="text-xs font-medium text-muted-foreground">
              Notes
            </h3>
            <p className="text-sm whitespace-pre-wrap text-ink">{entry.notes}</p>
          </section>
        )}
        {fields.length === 0 && !entry.notes.trim() && (
          <p className="text-sm text-muted-foreground">
            Nothing written about {entry.named ? entry.name : "this entry"} yet.
          </p>
        )}
      </div>
    </>
  )
}
