import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  IndentIncreaseIcon,
  Maximize2Icon,
  PenLineIcon,
  PlusIcon,
  SplitIcon,
  Trash2Icon,
} from "lucide-react"
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { Link } from "react-router"
import { announce, attempt } from "@/app/feedback"
import { DeferredMenu } from "@/components/DeferredMenu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useDraft } from "@/components/useDraft"
import { byData, focusPending, focusSoon } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { ActMenu } from "./ActMenu"
import { EntryChip, MetaChips, PresentLine, StatusBadge } from "./Chips"
import {
  chapterStepTarget,
  foldAct,
  foldChapter,
  moveActBy,
  moveSceneBy,
  splitAct,
  splitChapter,
  stepChapter,
  trashChapterWithUndo,
  trashSceneWithUndo,
} from "./commands"
import type { DisplayField } from "./display"
import { createChapter, createScene, renameAct, updateBeat, updateChapter, updateScene } from "./mutations"
import {
  caretAtEdge,
  MOD,
  OutlineNavContext,
  outlineStops,
  rowKeyOf,
  stopKey,
  useOutlineNav,
  type OutlineNav,
} from "./outlineNav"
import { usePlanContext, type FocusItem } from "./planContext"
import { LOOSE_GROUP, type PlanActRow, type PlanChapter, type PlanGroup, type PlanSceneRow } from "./planData"
import { actLabel, chapterTitle, UNTITLED_CHAPTER, UNTITLED_SCENE } from "./status"

const HELP_ID = "outline-help"
const SUMMARY_HELP_ID = "outline-summary-help"
/** A contextmenu event this soon after Shift+F10 or the menu key is the browser's menu, which ours replaces. */
const MENU_KEY_MS = 1000

const scrollMargins = "scroll-mt-28 scroll-mb-8 pointer-coarse:scroll-mt-30"
const stopClass = cn(
  scrollMargins,
  "border-transparent bg-transparent px-1.5 shadow-none hover:border-input dark:bg-transparent",
)

/**
 * What a title's keys do (see outlineNav.ts). The row's ⋯ menu runs the same actions. Tab and Shift+Tab pass the
 * field's text, which the plan may not show yet.
 */
interface StopActions {
  /** Enter: the next item. */
  add: () => Promise<unknown>
  /** Tab. */
  indent: (title?: string) => Promise<unknown> | void
  /** Shift+Tab. */
  outdent: (title?: string) => Promise<unknown> | void
  /** Alt+↑/↓. */
  move: (delta: -1 | 1) => Promise<unknown>
  /** Ctrl/Cmd+Enter. */
  details?: () => void
}

/**
 * The Outline (DESIGN.md §6): the book as one editable tree of acts, chapters and scenes, with summaries and beats
 * inline. Built for the keyboard; outlineNav.ts has the keys.
 */
export function Outline() {
  const { plan, display } = usePlanContext()
  const stops = useMemo(() => outlineStops(plan, display.fields.has("summary")), [plan, display.fields])
  const nav = useOutlineNavState(stops)

  return (
    <OutlineNavContext.Provider value={nav}>
      <div className="mx-auto max-w-4xl px-4 pt-4 pb-24 sm:px-6">
        {stops.length === 0 ? (
          <EmptyOutline />
        ) : (
          <>
            <OutlineHelp />
            <div className="space-y-8">
              {plan.groups.map((group) =>
                group.act ? (
                  <OutlineAct key={group.key} group={group} act={group.act} />
                ) : (
                  <LooseChapters key={group.key} group={group} />
                ),
              )}
            </div>
          </>
        )}
      </div>
    </OutlineNavContext.Provider>
  )
}

function useOutlineNavState(stops: string[]): OutlineNav {
  const [current, setCurrent] = useState<string | null>(null)
  const [parkedAt, setParkedAt] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const stopsRef = useRef(stops)
  const busy = useRef(false)
  const menuKeyAt = useRef(-Infinity)

  useLayoutEffect(() => {
    stopsRef.current = stops
  })

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (performance.now() - menuKeyAt.current > MENU_KEY_MS) return
      menuKeyAt.current = -Infinity
      event.preventDefault()
    }
    window.addEventListener("contextmenu", onContextMenu, true)
    return () => window.removeEventListener("contextmenu", onContextMenu, true)
  }, [])

  const tabbable = parkedAt ? null : current && stops.includes(current) ? current : (stops[0] ?? null)

  const focusStop = useCallback((key: string, caret: "start" | "end" = "end") => {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(byData("outline-stop", key))
    if (!element) return false
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: "nearest" })
    const at = caret === "start" ? 0 : element.value.length
    element.setSelectionRange(at, at)
    return true
  }, [])

  const step = useCallback(
    (key: string, delta: -1 | 1) => {
      const list = stopsRef.current
      const index = list.indexOf(key)
      const next = index === -1 ? undefined : list[index + delta]
      if (!next) return false
      // Coming down into a summary starts at its first line, so ↓ keeps reading on.
      return focusStop(next, delta === 1 && next.startsWith("summary:") ? "start" : "end")
    },
    [focusStop],
  )

  const park = useCallback((key: string) => {
    document.querySelector<HTMLElement>(byData("outline-row", rowKeyOf(key)))?.focus()
  }, [])

  const entered = useCallback((key: string) => {
    setCurrent(key)
    setParkedAt(null)
  }, [])

  const rowFocused = useCallback((rowKey: string) => {
    setParkedAt(rowKey)
    setCurrent((key) => (key && rowKeyOf(key) === rowKey ? key : rowKey))
  }, [])

  const rowBlurred = useCallback(() => setParkedAt(null), [])

  const run = useCallback((work: () => Promise<unknown>) => {
    if (busy.current || focusPending()) return false
    busy.current = true
    void attempt("edit outline", Promise.resolve().then(work)).finally(() => {
      busy.current = false
    })
    return true
  }, [])

  const openMenu = useCallback((rowKey: string) => {
    menuKeyAt.current = performance.now()
    setMenuFor(rowKey)
  }, [])

  return useMemo(
    () => ({ tabbable, entered, focusStop, step, park, rowFocused, rowBlurred, run, menuFor, setMenuFor, openMenu }),
    [tabbable, entered, focusStop, step, park, rowFocused, rowBlurred, run, menuFor, openMenu],
  )
}

function OutlineHelp() {
  return (
    <>
      <p aria-hidden="true" className="mb-5 hidden flex-wrap gap-x-4 gap-y-1 px-1.5 text-xs text-muted-foreground sm:flex">
        <Hint keys={["Enter"]}>new</Hint>
        <Hint keys={["Tab"]}>fold into the one above</Hint>
        <Hint keys={["Shift", "Tab"]}>split off</Hint>
        <Hint keys={["Alt", "↑↓"]}>move</Hint>
        <Hint keys={[MOD.key, "Enter"]}>details</Hint>
        <Hint keys={["Esc"]}>then Tab to leave</Hint>
      </p>
      <p id={HELP_ID} hidden>
        Enter adds the next item. Tab folds a chapter into the one above as scenes. Shift+Tab starts a new chapter at a
        scene, or a new act at a chapter. Alt plus Up or Down arrow moves it. {MOD.name} plus Enter opens the chapter's
        details. Escape, then Tab, leaves the outline.
      </p>
      <p id={SUMMARY_HELP_ID} hidden>
        Alt plus Up or Down arrow moves the chapter. {MOD.name} plus Enter opens its details. Tab leaves the outline.
      </p>
    </>
  )
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 && "+"}
          <kbd className="rounded border bg-surface px-1 py-px font-sans text-[0.6875rem] text-ink-2">{key}</kbd>
        </Fragment>
      ))}
      <span className="ml-0.5">{children}</span>
    </span>
  )
}

function EmptyOutline() {
  const { db, bookId, focusItem } = usePlanContext()
  const add = async () => {
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: null }))
    if (id) focusItem("chapter", id)
  }
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-16 text-center">
      <h2 className="font-heading text-xl font-semibold">Nothing planned yet</h2>
      <p className="text-sm text-ink-2">
        The outline is your book as a list of acts, chapters and scenes. Add a chapter to start, then press Enter for
        the next one.
      </p>
      <Button onClick={() => void add()}>
        <PlusIcon />
        Add the first chapter
      </Button>
    </div>
  )
}

function OutlineAct({ group, act }: { group: PlanGroup; act: Readonly<PlanActRow> }) {
  const { db, bookId, plan, focusItem } = usePlanContext()
  const nav = useOutlineNav()
  const key = stopKey("act", act.id)
  const label = actLabel(group, plan.hasActs)
  const headingId = `outline-act-${act.id}`
  const count = group.chapters.length

  const actions: StopActions = {
    add: async () => {
      const id = await createChapter(db, bookId, { actId: act.id, index: 0 })
      focusItem("chapter", id)
    },
    indent: (title) => foldAct(db, plan, act.id, focusItem, title),
    outdent: () => announce("Acts are already at the top level."),
    move: (delta) => moveActBy(db, plan, act.id, delta, focusItem),
  }

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      <OutlineRow rowKey={key} label={label} data-tour="plan-act" className="flex items-start gap-2 py-1 pr-1">
        {/* On narrow screens the stats wrap below the title rather than squeezing it. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <TitleStop
            stop={key}
            value={act.title ?? ""}
            onSave={(title) => renameAct(db, act.id, title)}
            actions={actions}
            aria-label={`Title of act ${group.index + 1}`}
            placeholder={`Act ${group.index + 1}`}
            className="h-10 min-w-0 flex-1 basis-56 font-heading text-xl font-semibold md:text-xl"
          />
          <span className="shrink-0 px-1.5 text-xs text-muted-foreground tabular-nums">
            {count} {count === 1 ? "chapter" : "chapters"} · {formatCount(group.words)}
            {group.target > 0 && ` / ${formatCount(group.target)}`} words
          </span>
        </div>
        <div className="flex h-10 shrink-0 items-center pointer-coarse:h-11">
          <ActMenu
            group={group}
            shortcuts
            open={nav.menuFor === key}
            onOpenChange={(open) => {
              if (open) nav.setMenuFor(key)
              else if (nav.menuFor === key) nav.setMenuFor(null)
            }}
            returnFocus={() => void nav.focusStop(key)}
            triggerTabIndex={-1}
          />
        </div>
      </OutlineRow>
      {count > 0 ? <ChapterList group={group} label={label} /> : <EmptyAct act={act} />}
    </section>
  )
}

/** Chapters outside any act: the whole book when it has no acts, else strays shown after the acts. */
function LooseChapters({ group }: { group: PlanGroup }) {
  const { plan } = usePlanContext()
  if (group.chapters.length === 0) return null
  const label = actLabel(group, plan.hasActs)
  return (
    <section aria-labelledby="outline-loose">
      <h2
        id="outline-loose"
        className={plan.hasActs ? "px-1.5 py-1 font-heading text-xl font-semibold" : "sr-only"}
      >
        {label}
      </h2>
      {plan.hasActs && (
        <p className="mb-1 px-1.5 text-sm text-muted-foreground">
          These chapters aren't in an act. Alt+↑ on the first one moves it into the act above.
        </p>
      )}
      <ChapterList group={group} label={label} />
    </section>
  )
}

function ChapterList({ group, label }: { group: PlanGroup; label: string }) {
  return (
    <ol aria-label={group.act ? `Chapters in ${label}` : label} className="mt-1 grid gap-1">
      {group.chapters.map((chapter) => (
        <OutlineChapter key={chapter.id} chapter={chapter} />
      ))}
    </ol>
  )
}

function EmptyAct({ act }: { act: Readonly<PlanActRow> }) {
  const { db, bookId, focusItem } = usePlanContext()
  const add = async () => {
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: act.id }))
    if (id) focusItem("chapter", id)
  }
  return (
    <div className="mt-1 ml-9.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed py-1.5 pr-1.5 pl-3 text-sm text-muted-foreground">
      No chapters in this act yet.
      <Button variant="ghost" size="sm" tabIndex={-1} onClick={() => void add()}>
        <PlusIcon />
        Add chapter
      </Button>
    </div>
  )
}

interface OutlineRowProps extends ComponentProps<"div"> {
  rowKey: string
  label: string
}

/**
 * A row of the tree. Never in the Tab order, but focusable: Escape steps out of a field to its row, so that Tab can
 * then leave the outline.
 */
function OutlineRow({ rowKey, label, className, children, ...props }: OutlineRowProps) {
  const nav = useOutlineNav()

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    if (plain && (event.key === "Enter" || event.key === "F2")) {
      event.preventDefault()
      nav.focusStop(rowKey)
    } else if (plain && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault()
      nav.step(rowKey, event.key === "ArrowUp" ? -1 : 1)
    } else if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
      event.preventDefault()
      nav.openMenu(rowKey)
    }
  }

  return (
    <div
      {...props}
      data-outline-row={rowKey}
      role="group"
      aria-label={label}
      tabIndex={-1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) nav.rowFocused(rowKey)
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) nav.rowBlurred()
      }}
      onKeyDown={onKeyDown}
      className={cn(scrollMargins, "rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50", className)}
    >
      {children}
    </div>
  )
}

interface TitleStopProps extends Omit<ComponentProps<typeof Input>, "value" | "onChange"> {
  stop: string
  value: string
  onSave: (next: string) => Promise<unknown>
  actions: StopActions
}

/** The title of an act, chapter or scene: a field that saves as you type, with the outline's keys. */
function TitleStop({ stop, value, onSave, actions, className, ...props }: TitleStopProps) {
  const nav = useOutlineNav()
  const draft = useDraft(value, onSave)

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event.nativeEvent)) return
    const mod = event.ctrlKey || event.metaKey
    const { altKey: alt, shiftKey: shift } = event
    // Saves the title first: the edit may move or remove this field.
    const structural = (work: () => Promise<unknown> | void) => {
      event.preventDefault()
      nav.run(async () => {
        await draft.flush()
        await work()
      })
    }
    switch (event.key) {
      case "Enter":
        if (alt || shift) return
        if (!mod) structural(actions.add)
        else if (actions.details) {
          event.preventDefault()
          actions.details()
        }
        return
      case "Tab": {
        if (mod || alt) return
        const title = draft.value
        structural(() => (shift ? actions.outdent : actions.indent)(title))
        return
      }
      case "ArrowUp":
      case "ArrowDown": {
        if (mod || shift) return
        const delta = event.key === "ArrowUp" ? -1 : 1
        if (alt) structural(() => actions.move(delta))
        else if (nav.step(stop, delta)) event.preventDefault()
        return
      }
      case "Escape":
        if (mod || alt || shift) return
        event.preventDefault()
        nav.park(stop)
        return
      case "F10":
      case "ContextMenu":
        if (event.key === "F10" && !shift) return
        event.preventDefault()
        nav.openMenu(rowKeyOf(stop))
    }
  }

  return (
    <Input
      {...props}
      data-outline-stop={stop}
      aria-describedby={HELP_ID}
      tabIndex={nav.tabbable === stop ? 0 : -1}
      value={draft.value}
      onChange={(event) => draft.onChange(event.target.value)}
      onFocus={() => {
        draft.onFocus()
        nav.entered(stop)
      }}
      onBlur={draft.onBlur}
      onKeyDown={onKeyDown}
      className={cn(stopClass, className)}
    />
  )
}

function OutlineChapter({ chapter }: { chapter: PlanChapter }) {
  const { db, bookId, plan, display, openId, matches, filtering, showChapter, focusItem } = usePlanContext()
  const nav = useOutlineNav()
  const key = stopKey("chapter", chapter.id)
  const has = (field: DisplayField) => display.fields.has(field)
  const pov = has("pov") && chapter.pov_entry_id ? plan.entries.get(chapter.pov_entry_id) : undefined
  const target = chapter.word_target ?? 0
  const loose = chapter.groupKey === LOOSE_GROUP
  const dimmed = filtering && !matches(chapter)

  const actions: StopActions = {
    add: async () => {
      // A stray's new neighbor goes to the last act: once a book has acts, new chapters belong to one.
      const placement =
        loose && plan.hasActs
          ? { actId: null }
          : { actId: loose ? null : chapter.groupKey, index: chapter.indexInGroup + 1 }
      const id = await createChapter(db, bookId, placement)
      focusItem("chapter", id)
    },
    indent: (title) => foldChapter(db, plan, chapter.id, focusItem, title),
    outdent: (title) => splitAct(db, plan, chapter.id, focusItem, title),
    move: (delta) => stepChapter(db, plan, chapter.id, delta < 0 ? "earlier" : "later", true, focusItem),
    details: () => showChapter(chapter.id),
  }

  return (
    <li
      data-tour="plan-chapter"
      className={cn(
        "rounded-xl transition-[opacity,filter,background-color]",
        openId === chapter.id && "bg-primary/5 ring-1 ring-primary/25",
        dimmed && "opacity-30 saturate-30 focus-within:opacity-100 focus-within:saturate-100 hover:opacity-80",
      )}
    >
      <OutlineRow
        rowKey={key}
        label={`Chapter ${chapter.number}: ${chapterTitle(chapter.title)}`}
        className="group/chapter px-1 py-1"
      >
        <div className="flex items-start gap-1.5">
          <span
            aria-hidden="true"
            className="w-7 shrink-0 text-right text-sm leading-8 text-muted-foreground tabular-nums pointer-coarse:leading-11"
          >
            {chapter.number}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
            <TitleStop
              stop={key}
              value={chapter.title ?? ""}
              onSave={(title) => updateChapter(db, chapter.id, { title })}
              actions={actions}
              aria-label={`Title of chapter ${chapter.number}`}
              placeholder={UNTITLED_CHAPTER}
              className="h-8 min-w-0 flex-1 basis-56 font-heading text-base font-semibold md:text-base"
            />
            {(has("status") || pov || has("words")) && (
              <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-1.5 text-xs">
                {has("status") && <StatusBadge status={chapter.status} />}
                {pov && <EntryChip entry={pov} />}
                {has("words") && (
                  <span className="text-muted-foreground tabular-nums">
                    {formatCount(chapter.words)}
                    {target > 0 && ` / ${formatCount(target)}`} words
                  </span>
                )}
              </div>
            )}
          </div>
          <RowActions group="chapter" open={nav.menuFor === key}>
            <Button
              variant="ghost"
              size="icon-sm"
              tabIndex={-1}
              data-open-chapter={chapter.id}
              aria-label={`Open details for chapter ${chapter.number}`}
              title={`Details (${MOD.key}+Enter)`}
              onClick={() => showChapter(chapter.id)}
              className="text-muted-foreground"
            >
              <Maximize2Icon />
            </Button>
            <ChapterMenu chapter={chapter} rowKey={key} actions={actions} />
          </RowActions>
        </div>
        <div className="grid gap-1.5 pl-8.5 empty:hidden">
          {has("summary") && <SummaryStop chapter={chapter} />}
          {has("beats") && chapter.beats.length > 0 && <BeatList chapter={chapter} />}
          <MetaChips chapter={chapter} entries={plan.entries} fields={display.fields} className="px-1.5" />
          <PresentLine chapter={chapter} entries={plan.entries} fields={display.fields} className="px-1.5" />
        </div>
      </OutlineRow>
      {chapter.explicitScenes.length > 0 && (
        <ol aria-label={`Scenes in chapter ${chapter.number}`} className="mb-1 ml-11 grid gap-px border-l pl-1.5">
          {chapter.explicitScenes.map((scene, index) => (
            <OutlineScene key={scene.id} chapter={chapter} scene={scene} index={index} />
          ))}
        </ol>
      )}
    </li>
  )
}

/** The chapter's summary, edited in place. Enter is a new line here; ↑/↓ leave from the first or last line. */
function SummaryStop({ chapter }: { chapter: PlanChapter }) {
  const { db, plan, focusItem, showChapter } = usePlanContext()
  const nav = useOutlineNav()
  const key = stopKey("summary", chapter.id)
  const draft = useDraft(chapter.summary ?? "", (summary) => updateChapter(db, chapter.id, { summary }))

  // After Alt+↑/↓ the summary keeps focus, wherever its chapter lands.
  const focusSummary: FocusItem = (kind, id) => {
    if (kind === "chapter") focusSoon(byData("outline-stop", stopKey("summary", id)))
    else focusItem(kind, id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing(event.nativeEvent)) return
    const mod = event.ctrlKey || event.metaKey
    const { altKey: alt, shiftKey: shift } = event
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !mod && !shift) {
      const delta = event.key === "ArrowUp" ? -1 : 1
      if (alt) {
        event.preventDefault()
        nav.run(async () => {
          await draft.flush()
          await stepChapter(db, plan, chapter.id, delta < 0 ? "earlier" : "later", true, focusSummary)
        })
      } else if (caretAtEdge(event.currentTarget, delta < 0) && nav.step(key, delta)) {
        event.preventDefault()
      }
    } else if (event.key === "Enter" && mod && !alt && !shift) {
      event.preventDefault()
      showChapter(chapter.id)
    } else if (event.key === "Escape" && !mod && !alt && !shift) {
      event.preventDefault()
      nav.park(key)
    } else if ((event.key === "F10" && shift) || event.key === "ContextMenu") {
      event.preventDefault()
      nav.openMenu(rowKeyOf(key))
    }
  }

  return (
    <Textarea
      data-outline-stop={key}
      aria-label={`Summary of chapter ${chapter.number}`}
      aria-describedby={SUMMARY_HELP_ID}
      tabIndex={nav.tabbable === key ? 0 : -1}
      rows={1}
      placeholder="What happens in this chapter…"
      value={draft.value}
      onChange={(event) => draft.onChange(event.target.value)}
      onFocus={() => {
        draft.onFocus()
        nav.entered(key)
      }}
      onBlur={draft.onBlur}
      onKeyDown={onKeyDown}
      className={cn(
        stopClass,
        "min-h-0 resize-none py-1 text-base leading-relaxed text-ink-2 md:text-sm pointer-coarse:py-2.5",
      )}
    />
  )
}

/** Moments as a read-only checklist: tick them here, edit them in the chapter's details. */
function BeatList({ chapter }: { chapter: PlanChapter }) {
  const { db } = usePlanContext()
  return (
    <ul aria-label={`Moments in chapter ${chapter.number}`} className="grid gap-1 px-1.5">
      {chapter.beats.map((beat) => {
        const textId = `outline-beat-${beat.id}`
        return (
          <li key={beat.id} className="flex items-start gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:items-center">
            <Checkbox
              tabIndex={-1}
              checked={!!beat.done}
              aria-labelledby={textId}
              onCheckedChange={(checked) =>
                void attempt("tick moment", updateBeat(db, beat.id, { done: checked === true }))
              }
              className="mt-0.5 pointer-coarse:mt-0"
            />
            <span
              id={textId}
              className={cn("min-w-0 flex-1 leading-snug text-ink-2", beat.done && "text-muted-foreground line-through")}
            >
              {beat.text?.trim() || "Untitled moment"}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

interface OutlineSceneProps {
  chapter: PlanChapter
  scene: Readonly<PlanSceneRow>
  index: number
}

function OutlineScene({ chapter, scene, index }: OutlineSceneProps) {
  const { db, plan, display, focusItem, showChapter } = usePlanContext()
  const nav = useOutlineNav()
  const key = stopKey("scene", scene.id)

  const actions: StopActions = {
    add: async () => {
      const position = chapter.scenes.findIndex((candidate) => candidate.id === scene.id)
      const id = await createScene(db, chapter.id, { index: position + 1 })
      focusItem("scene", id)
    },
    indent: () => announce("A scene can't go any deeper. Shift+Tab starts a new chapter at this scene."),
    outdent: (title) => splitChapter(db, plan, chapter.id, scene.id, focusItem, title),
    move: (delta) => moveSceneBy(db, plan, chapter.id, scene.id, delta, focusItem),
    details: () => showChapter(chapter.id),
  }

  return (
    <li>
      <OutlineRow
        rowKey={key}
        label={`Scene ${index + 1}: ${scene.title?.trim() || UNTITLED_SCENE}`}
        className="group/scene flex items-center gap-2 pr-1"
      >
        <TitleStop
          stop={key}
          value={scene.title ?? ""}
          onSave={(title) => updateScene(db, scene.id, { title })}
          actions={actions}
          aria-label={`Title of scene ${index + 1} in chapter ${chapter.number}`}
          placeholder={UNTITLED_SCENE}
          className="h-7 min-w-0 flex-1 text-base md:text-sm"
        />
        {display.fields.has("words") && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatCount(scene.word_count ?? 0)} words
          </span>
        )}
        <RowActions group="scene" open={nav.menuFor === key}>
          <SceneMenu chapter={chapter} scene={scene} index={index} rowKey={key} actions={actions} />
        </RowActions>
      </OutlineRow>
    </li>
  )
}

/** Mouse controls on a row: shown on hover or focus, always on touch screens. Keyboard users get Shift+F10. */
function RowActions({ group, open, children }: { group: "chapter" | "scene"; open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity pointer-coarse:opacity-100",
        group === "chapter"
          ? "group-focus-within/chapter:opacity-100 group-hover/chapter:opacity-100"
          : "group-focus-within/scene:opacity-100 group-hover/scene:opacity-100",
        open && "opacity-100",
      )}
    >
      {children}
    </div>
  )
}

interface RowMenuProps {
  rowKey: string
  label: string
  onCloseAutoFocus: (event: Event) => void
  children: ReactNode
}

/** A row's ⋯ menu, opened from its button or with Shift+F10 / the menu key in the row. */
function RowMenu({ rowKey, label, onCloseAutoFocus, children }: RowMenuProps) {
  const nav = useOutlineNav()
  return (
    <DeferredMenu
      open={nav.menuFor === rowKey}
      onOpenChange={(open) => {
        if (open) nav.setMenuFor(rowKey)
        else if (nav.menuFor === rowKey) nav.setMenuFor(null)
      }}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          tabIndex={-1}
          aria-label={`More for ${label}`}
          className="text-muted-foreground"
        >
          <EllipsisIcon />
        </Button>
      }
    >
      <DropdownMenuContent align="end" className="w-64" onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </DropdownMenuContent>
    </DeferredMenu>
  )
}

/**
 * A row menu's items run through the outline like its keys do. Commands place focus themselves; closing the menu
 * without one puts focus back in the row's title.
 */
function useMenuCommands(rowKey: string) {
  const nav = useOutlineNav()
  const commandRan = useRef(false)
  const command = (work: () => Promise<unknown> | void) => () => {
    commandRan.current = nav.run(async () => {
      await work()
    })
  }
  const navigates = () => {
    commandRan.current = true
  }
  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    if (commandRan.current) commandRan.current = false
    else nav.focusStop(rowKey)
  }
  return { command, navigates, onCloseAutoFocus }
}

interface ChapterMenuProps {
  chapter: PlanChapter
  rowKey: string
  actions: StopActions
}

function ChapterMenu({ chapter, rowKey, actions }: ChapterMenuProps) {
  const { db, bookId, plan, focusItem, showChapter } = usePlanContext()
  const { command, navigates, onCloseAutoFocus } = useMenuCommands(rowKey)
  const first = chapter.indexInGroup === 0
  const stray = plan.hasActs && chapter.groupKey === LOOSE_GROUP
  const blocked = (step: "earlier" | "later") => typeof chapterStepTarget(plan, chapter, step, true) === "string"

  return (
    <RowMenu rowKey={rowKey} label={`chapter ${chapter.number}`} onCloseAutoFocus={onCloseAutoFocus}>
      <DropdownMenuItem
        onSelect={() => {
          navigates()
          showChapter(chapter.id)
        }}
      >
        <Maximize2Icon />
        Open details
        <DropdownMenuShortcut>{MOD.key}+Enter</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem asChild onSelect={navigates}>
        <Link to={`/b/${bookId}/write/${chapter.id}`}>
          <PenLineIcon />
          Write
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={command(async () => {
          const id = await createScene(db, chapter.id)
          focusItem("scene", id)
        })}
      >
        <PlusIcon />
        Add scene
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={command(actions.add)}>
        <PlusIcon />
        Add chapter below
        <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={first} onSelect={command(actions.indent)}>
        <IndentIncreaseIcon />
        Fold into the chapter above
        <DropdownMenuShortcut>Tab</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={first || stray} onSelect={command(actions.outdent)}>
        <SplitIcon />
        Start a new act here
        <DropdownMenuShortcut>Shift+Tab</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={blocked("earlier")} onSelect={command(() => actions.move(-1))}>
        <ArrowUpIcon />
        Move up
        <DropdownMenuShortcut>Alt+↑</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={blocked("later")} onSelect={command(() => actions.move(1))}>
        <ArrowDownIcon />
        Move down
        <DropdownMenuShortcut>Alt+↓</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={command(() => trashChapterWithUndo(db, plan, chapter.id, focusItem))}
      >
        <Trash2Icon />
        Move to Trash
      </DropdownMenuItem>
    </RowMenu>
  )
}

interface SceneMenuProps extends OutlineSceneProps {
  rowKey: string
  actions: StopActions
}

function SceneMenu({ chapter, scene, index, rowKey, actions }: SceneMenuProps) {
  const { db, bookId, plan, focusItem, showChapter } = usePlanContext()
  const { command, navigates, onCloseAutoFocus } = useMenuCommands(rowKey)
  const position = chapter.scenes.findIndex((candidate) => candidate.id === scene.id)

  return (
    <RowMenu rowKey={rowKey} label={`scene ${index + 1}`} onCloseAutoFocus={onCloseAutoFocus}>
      <DropdownMenuItem
        onSelect={() => {
          navigates()
          showChapter(chapter.id)
        }}
      >
        <Maximize2Icon />
        Chapter details
        <DropdownMenuShortcut>{MOD.key}+Enter</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem asChild onSelect={navigates}>
        <Link to={`/b/${bookId}/write/${chapter.id}`}>
          <PenLineIcon />
          Write
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={command(actions.add)}>
        <PlusIcon />
        Add scene below
        <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={position <= 0} onSelect={command(actions.outdent)}>
        <SplitIcon />
        Start a new chapter here
        <DropdownMenuShortcut>Shift+Tab</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={position <= 0} onSelect={command(() => actions.move(-1))}>
        <ArrowUpIcon />
        Move up
        <DropdownMenuShortcut>Alt+↑</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={position === -1 || position >= chapter.scenes.length - 1}
        onSelect={command(() => actions.move(1))}
      >
        <ArrowDownIcon />
        Move down
        <DropdownMenuShortcut>Alt+↓</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={command(() => trashSceneWithUndo(db, plan, chapter.id, scene.id, focusItem))}
      >
        <Trash2Icon />
        Move to Trash
      </DropdownMenuItem>
    </RowMenu>
  )
}
