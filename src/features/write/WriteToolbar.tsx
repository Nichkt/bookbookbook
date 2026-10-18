import { useQuery } from "@powersync/react"
import { useEditorState, type Editor } from "@tiptap/react"
import {
  BoldIcon,
  BookOpenTextIcon,
  BookUserIcon,
  EllipsisIcon,
  FileTextIcon,
  HistoryIcon,
  ItalicIcon,
  NotebookTextIcon,
  PanelLeftIcon,
  ScrollTextIcon,
  SeparatorHorizontalIcon,
  TextAlignCenterIcon,
  TextQuoteIcon,
  type LucideIcon,
} from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAfterMenu } from "@/components/useAfterMenu"
import { DAY_STATS_SQL, localDay, type DayStatsRow } from "@/db/stats"
import { activeEditor, useActiveEditor, type MountedEditor } from "@/editor/activeEditor"
import { type Plan } from "@/features/plan/planData"
import { actLabel, chapterTitle } from "@/features/plan/status"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { formatCount } from "@/lib/numbers"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { openHistory } from "./history"
import { NAVIGATOR_ID } from "./Navigator"
import {
  isWriteUnit,
  sceneNameIn,
  UNIT_LABELS,
  useWrite,
  WRITE_UNITS,
  writePath,
  type PanelPage,
  type WriteUnit,
} from "./writeContext"

const UNIT_ICONS: Record<WriteUnit, LucideIcon> = {
  scene: FileTextIcon,
  chapter: BookOpenTextIcon,
  manuscript: ScrollTextIcon,
}

/** From here up the toolbar has room for every tool; below it, the phone bar puts most in a menu. */
const WIDE_QUERY = "(min-width: 48rem)"

const BAR_CLASS =
  "sticky top-14 z-20 flex h-12 items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur pointer-coarse:h-14"

/** The Write screen's toolbar (DESIGN.md §8). Formatting acts on the scene the writer is in, or was last in. */
export function WriteToolbar() {
  const wide = useMediaQuery(WIDE_QUERY)
  const active = useActiveEditor()
  const format = useFormatState(active?.editor ?? null)
  return wide ? <WideToolbar active={active} format={format} /> : <PhoneToolbar active={active} format={format} />
}

interface ToolbarProps {
  active: MountedEditor | null
  format: FormatState
}

interface FormatState {
  bold: boolean
  italic: boolean
  quote: boolean
  centered: boolean
}

const NO_FORMAT: FormatState = { bold: false, italic: false, quote: false, centered: false }

function useFormatState(editor: Editor | null): FormatState {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }): FormatState =>
      !current || current.isDestroyed
        ? NO_FORMAT
        : {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            quote: current.isActive("blockquote"),
            centered: current.isActive({ textAlign: "center" }),
          },
  })
  return state ?? NO_FORMAT
}

/** Runs a command on the scene the writer is in, focusing it first: after a toolbar button, the writer carries on typing. */
const command = (run: (editor: Editor) => void) => {
  const editor = activeEditor()?.editor
  if (editor && !editor.isDestroyed) run(editor)
}

/** Opens the History dialog of the scene the writer is in. */
const showHistory = (plan: Plan, returnFocus: HTMLElement | null) => {
  const target = activeEditor()
  if (target) openHistory(target.sceneId, sceneNameIn(plan, target.sceneId), returnFocus)
}

const toggleBold = (editor: Editor) => editor.chain().focus().toggleBold().run()
const toggleItalic = (editor: Editor) => editor.chain().focus().toggleItalic().run()
const toggleQuote = (editor: Editor) => editor.chain().focus().toggleBlockquote().run()
const toggleCenter = (editor: Editor) => editor.chain().focus().toggleTextAlign("center").run()
const sceneBreak = (editor: Editor) => editor.chain().focus().setHorizontalRule().run()

function WideToolbar({ active, format }: ToolbarProps) {
  const { plan, unit, setUnit, navOpen, toggleNav } = useWrite()
  const editor = active?.editor
  return (
    <div data-write-toolbar="" data-sticky-top="" className={BAR_CLASS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Navigator"
            data-tour="write-chapters"
            aria-expanded={navOpen}
            aria-controls={navOpen ? NAVIGATOR_ID : undefined}
            onClick={toggleNav}
            className="text-ink-2"
          >
            <PanelLeftIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{navOpen ? "Hide chapters" : "Show chapters"}</TooltipContent>
      </Tooltip>
      <Divider />
      <ToggleGroup
        type="single"
        spacing={1}
        aria-label="Write view"
        data-tour="write-views"
        value={unit}
        onValueChange={(value) => isWriteUnit(value) && setUnit(value)}
        // Looks like the Plan's view switcher.
        className="shrink-0 gap-0 rounded-lg bg-muted p-0.5"
      >
        {WRITE_UNITS.map((name) => {
          const Icon = UNIT_ICONS[name]
          return (
            <ToggleGroupItem
              key={name}
              value={name}
              className="h-7 gap-1.5 rounded-md px-2.5 text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-background data-[state=on]:text-ink data-[state=on]:shadow-sm"
            >
              <Icon aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">{UNIT_LABELS[name]}</span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <Divider />
      <FormatToggle
        label="Bold"
        keys="Mod+B"
        icon={BoldIcon}
        pressed={format.bold}
        editor={editor}
        run={toggleBold}
      />
      <FormatToggle
        label="Italic"
        keys="Mod+I"
        icon={ItalicIcon}
        pressed={format.italic}
        editor={editor}
        run={toggleItalic}
      />
      <FormatToggle
        label="Block quote"
        keys="Mod+Shift+B"
        icon={TextQuoteIcon}
        pressed={format.quote}
        editor={editor}
        run={toggleQuote}
      />
      <FormatToggle
        label="Center"
        keys="Mod+Shift+E"
        icon={TextAlignCenterIcon}
        pressed={format.centered}
        editor={editor}
        run={toggleCenter}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Scene break"
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(sceneBreak)}
            className="text-ink-2"
          >
            <SeparatorHorizontalIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Scene break · or type --- on a new line</TooltipContent>
      </Tooltip>
      <TodayCount className="ml-auto pl-2" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="History"
            data-tour="write-history"
            disabled={!active}
            onClick={(event) => showHistory(plan, event.currentTarget)}
            className="text-ink-2"
          >
            <HistoryIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>History · Snapshot {shortcutLabel("Mod+Alt+S")}</TooltipContent>
      </Tooltip>
      <PanelButton page="plan" label="Chapter plan" icon={NotebookTextIcon} tour="write-plan-panel" />
      <PanelButton page="codex" label="World" icon={BookUserIcon} tour="write-world-panel" />
    </div>
  )
}

interface PanelButtonProps {
  page: PanelPage
  label: string
  icon: LucideIcon
  /** Where the Write tour points. */
  tour: string
}

/** Opens the panel at its page, or closes it when the page is showing: the toolbar's buttons are the panel's tabs. */
function PanelButton({ page, label, icon: Icon, tour }: PanelButtonProps) {
  const { panel, setPanel } = useWrite()
  const showing = panel === page
  return (
    <Button
      variant={showing ? "secondary" : "ghost"}
      size="sm"
      aria-expanded={showing}
      data-write-panel-return={page}
      data-tour={tour}
      onClick={() => setPanel(showing ? null : page)}
      className="shrink-0 text-ink-2"
    >
      <Icon />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </Button>
  )
}

const Divider = () => <div aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />

interface FormatToggleProps {
  label: string
  /** As shortcutLabel takes them, e.g. "Mod+Shift+B". */
  keys: string
  icon: LucideIcon
  pressed: boolean
  editor: Editor | undefined
  run: (editor: Editor) => void
}

function FormatToggle({ label, keys, icon: Icon, pressed, editor, run }: FormatToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          aria-label={label}
          aria-keyshortcuts={ariaShortcut(keys)}
          pressed={pressed}
          disabled={!editor}
          // Keeps the selection in the text, so the format applies to it.
          onMouseDown={(event) => event.preventDefault()}
          onPressedChange={() => command(run)}
          className="shrink-0 text-ink-2"
        >
          <Icon />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>
        {label} · {shortcutLabel(keys)}
      </TooltipContent>
    </Tooltip>
  )
}

function PhoneToolbar({ active, format }: ToolbarProps) {
  const { bookId, plan, chapterId } = useWrite()
  const navigate = useNavigate()
  const editor = active?.editor
  return (
    <div data-write-toolbar="" data-sticky-top="" className={BAR_CLASS}>
      <label htmlFor="chapter-picker" className="sr-only">
        Chapter
      </label>
      <select
        id="chapter-picker"
        data-tour="write-chapters"
        value={chapterId}
        onChange={(event) => navigate(writePath(bookId, event.target.value))}
        className="h-11 min-w-0 flex-1 rounded-md border bg-surface px-3 text-base text-ink"
      >
        {plan.groups.map((group) => {
          if (group.chapters.length === 0) return null
          const options = group.chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.number}. {chapterTitle(chapter.title)}
            </option>
          ))
          return plan.hasActs ? (
            <optgroup key={group.key} label={actLabel(group, plan.hasActs)}>
              {options}
            </optgroup>
          ) : (
            <Fragment key={group.key}>{options}</Fragment>
          )
        })}
      </select>
      <FormatToggle
        label="Bold"
        keys="Mod+B"
        icon={BoldIcon}
        pressed={format.bold}
        editor={editor}
        run={toggleBold}
      />
      <FormatToggle
        label="Italic"
        keys="Mod+I"
        icon={ItalicIcon}
        pressed={format.italic}
        editor={editor}
        run={toggleItalic}
      />
      <PhoneMenu active={active} format={format} />
    </div>
  )
}

function PhoneMenu({ active, format }: ToolbarProps) {
  const { bookId, plan, unit, setUnit, setPanel } = useWrite()
  const trigger = useRef<HTMLButtonElement>(null)
  const { after, onCloseAutoFocus } = useAfterMenu()
  const today = useToday(bookId)
  const editor = active?.editor
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="icon-sm"
          aria-label="More writing tools"
          data-write-panel-return="menu"
          data-tour="write-views write-history write-plan-panel write-world-panel write-today"
          className="shrink-0 text-ink-2"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={unit} onValueChange={(value) => isWriteUnit(value) && setUnit(value)}>
          {WRITE_UNITS.map((name) => (
            <DropdownMenuRadioItem key={name} value={name}>
              {UNIT_LABELS[name]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={format.quote}
          disabled={!editor}
          onSelect={() => after(() => command(toggleQuote))}
        >
          Block quote
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={format.centered}
          disabled={!editor}
          onSelect={() => after(() => command(toggleCenter))}
        >
          Centered
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem disabled={!editor} onSelect={() => after(() => command(sceneBreak))}>
          <SeparatorHorizontalIcon />
          Scene break
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!active} onSelect={() => after(() => showHistory(plan, trigger.current))}>
          <HistoryIcon />
          History…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => after(() => setPanel("plan"))}>
          <NotebookTextIcon />
          Chapter plan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => after(() => setPanel("codex"))}>
          <BookUserIcon />
          World
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal text-muted-foreground tabular-nums">
          Today: {formatCount(today.added)} words added, {formatCount(today.removed)} removed
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Words written today in this book, net: what was added less what was cut. */
function TodayCount({ className }: { className?: string }) {
  const { bookId } = useWrite()
  const { added, removed } = useToday(bookId)
  const net = added - removed
  const detail = `Today: ${formatCount(added)} words added, ${formatCount(removed)} removed`
  return (
    <p
      title={detail}
      data-tour="write-today"
      className={cn("shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums", className)}
    >
      <span aria-hidden="true">
        Today {net < 0 ? "−" : "+"}
        {formatCount(Math.abs(net))}
      </span>
      <span className="sr-only">{detail}</span>
    </p>
  )
}

/** The book's stats for the writer's calendar day, which turns over at midnight while the page is open. */
function useToday(bookId: string): DayStatsRow {
  const [day, setDay] = useState(localDay)
  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(() => setDay(localDay()), midnight.getTime() - now.getTime() + 1000)
    return () => clearTimeout(timer)
  }, [day])
  const { data } = useQuery<DayStatsRow>(DAY_STATS_SQL, [bookId, day])
  return data[0] ?? { added: 0, removed: 0 }
}
