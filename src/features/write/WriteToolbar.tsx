import type { Editor } from "@tiptap/react"
import {
  BoldIcon,
  BookPlusIcon,
  BookUserIcon,
  EllipsisIcon,
  FocusIcon,
  HistoryIcon,
  ItalicIcon,
  MicIcon,
  Minimize2Icon,
  NotebookTextIcon,
  PanelLeftIcon,
  SearchIcon,
  SeparatorHorizontalIcon,
  SparklesIcon,
  TargetIcon,
  TextAlignCenterIcon,
  TextQuoteIcon,
  Volume2Icon,
  VolumeXIcon,
  type LucideIcon,
} from "lucide-react"
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAfterMenu } from "@/components/useAfterMenu"
import { useActiveEditor, type MountedEditor } from "@/editor/activeEditor"
import { actLabel, chapterTitle } from "@/features/plan/status"
import { focusSoon } from "@/lib/focus"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { formatCount } from "@/lib/numbers"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { openSpeechSetup } from "@/speech/settings"
import { addToWorldFromMenu } from "./addToWorld"
import { CONTINUE_KEYS } from "./ai/aiState"
import { FIND_KEYS } from "./findActions"
import { FOCUS_KEYS, setFocusMode, useFocusMode } from "./focusMode"
import {
  command,
  sceneBreak,
  toggleBold,
  toggleCenter,
  toggleItalic,
  toggleQuote,
  useFormatState,
  type FormatState,
} from "./formatting"
import { openGoals } from "./goals"
import { GoalsAnchor, GoalsPopover, SprintChip, TodayButton } from "./GoalsPopover"
import { SNAPSHOT_KEYS } from "./history"
import { NAVIGATOR_ID } from "./Navigator"
import { canReadAloud, READ_ALOUD_PLAY, startReading, stopReading, useReadAloud } from "./readAloud"
import { useGoalCelebration, useToday } from "./today"
import { DictateProse, Divider, FormatToggle } from "./ToolbarParts"
import {
  isWriteUnit,
  UNIT_LABELS,
  useWrite,
  useWritePlace,
  WIDE_WRITE_QUERY,
  WRITE_UNITS,
  writePath,
  type PanelPage,
} from "./writeContext"
import { showHistory, switchTypewriter } from "./writeActions"
import { UNIT_ICONS, useWriteCommands } from "./writeCommands"

const BAR_CLASS =
  "sticky top-14 z-20 flex h-12 items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur pointer-coarse:h-14"

/** The Write screen's toolbar (DESIGN.md §8). Formatting acts on the scene the writer is in, or was last in. */
export function WriteToolbar() {
  const { book, bookId } = useWrite()
  const wide = useMediaQuery(WIDE_WRITE_QUERY)
  const active = useActiveEditor()
  const format = useFormatState(active?.editor ?? null)
  const focusMode = useFocusMode((state) => state.on)
  useGoalCelebration(bookId, book.daily_goal)
  // Its tools are in the command palette too.
  useWriteCommands(wide)
  return (
    <GoalsPopover>
      {focusMode ? (
        <FocusBar editor={active?.editor} />
      ) : wide ? (
        <WideToolbar active={active} format={format} />
      ) : (
        <PhoneToolbar active={active} format={format} />
      )}
    </GoalsPopover>
  )
}

/** Whether the writer is typing, rather than moving the pointer: focus mode's bar fades away meanwhile. */
function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest(".ProseMirror")) setTyping(true)
    }
    const onPointerMove = () => setTyping(false)
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("pointermove", onPointerMove)
    }
  }, [])
  return typing
}

/** Focus mode's toolbar: dictation, today's words and the way out, fading while the writer types. */
function FocusBar({ editor }: { editor: Editor | undefined }) {
  const typing = useTyping()
  return (
    <Bar
      className={cn(
        "sticky top-0 z-20 flex h-12 items-center justify-end gap-1.5 bg-background/95 px-4 transition-opacity duration-500 pointer-coarse:h-14",
        typing && "opacity-0 focus-within:opacity-100 hover:opacity-100",
      )}
    >
      <DictateProse editor={editor} labelClassName="sr-only sm:not-sr-only" />
      <TodayButton />
      <Button
        variant="ghost"
        size="sm"
        aria-keyshortcuts="Escape"
        title="Esc"
        onClick={() => setFocusMode(false)}
        className="text-ink-2"
      >
        <Minimize2Icon />
        Exit focus mode
      </Button>
    </Bar>
  )
}

/** A toolbar's bar, sticking to the top as the page scrolls. Goals and sprints hangs from it. */
const Bar = ({ className, children }: { className: string; children: ReactNode }) => (
  <GoalsAnchor>
    <div data-write-toolbar="" data-sticky-top="" className={className}>
      {children}
    </div>
  </GoalsAnchor>
)

interface ToolbarProps {
  active: MountedEditor | null
  format: FormatState
}

function WideToolbar({ active, format }: ToolbarProps) {
  const { plan, unit, setUnit, navOpen, toggleNav } = useWrite()
  const editor = active?.editor
  return (
    <Bar className={BAR_CLASS}>
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
      <Divider />
      <DictateProse editor={editor} labelClassName="sr-only xl:not-sr-only" />
      <TodayButton className="ml-auto" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Focus mode"
            aria-keyshortcuts={ariaShortcut(FOCUS_KEYS)}
            data-tour="write-focus"
            onClick={() => setFocusMode(true)}
            className="text-ink-2"
          >
            <FocusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Focus mode · {shortcutLabel(FOCUS_KEYS)}</TooltipContent>
      </Tooltip>
      <MoreTools />
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
        <TooltipContent>History · Snapshot {shortcutLabel(SNAPSHOT_KEYS)}</TooltipContent>
      </Tooltip>
      <PanelButton page="plan" label="Chapter plan" icon={NotebookTextIcon} tour="write-plan-panel" />
      <PanelButton page="codex" label="World" icon={BookUserIcon} tour="write-world-panel" />
      <PanelButton page="find" label="Find" icon={SearchIcon} tour="write-find" keys={FIND_KEYS} />
      <PanelButton
        page="ai"
        label="AI tools"
        icon={SparklesIcon}
        tour="write-ai"
        tooltip={`AI tools · Continue ${shortcutLabel(CONTINUE_KEYS)}`}
      />
    </Bar>
  )
}

interface PanelButtonProps {
  page: PanelPage
  label: string
  icon: LucideIcon
  /** Where the Write tour points. */
  tour: string
  /** Its shortcut, as shortcutLabel takes it, for its tooltip. */
  keys?: string
  /** Its tooltip, when it isn't the label and the shortcut. */
  tooltip?: string
}

/** Opens the panel at its page, or closes it when the page is showing: the toolbar's buttons are the panel's tabs. */
function PanelButton({ page, label, icon: Icon, tour, keys, tooltip }: PanelButtonProps) {
  const { panel, setPanel } = useWrite()
  const showing = panel === page
  const button = (
    <Button
      variant={showing ? "secondary" : "ghost"}
      size="sm"
      aria-expanded={showing}
      aria-keyshortcuts={keys && ariaShortcut(keys)}
      data-write-panel-return={page}
      data-tour={tour}
      onClick={() => setPanel(showing ? null : page)}
      className="shrink-0 text-ink-2"
    >
      <Icon />
      <span className="sr-only xl:not-sr-only">{label}</span>
    </Button>
  )
  const tip = tooltip ?? (keys ? `${label} · ${shortcutLabel(keys)}` : null)
  if (!tip) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

/** The wide toolbar's less used writing aids. */
function MoreTools() {
  const { typewriter, setTypewriter } = useWrite()
  const trigger = useRef<HTMLButtonElement>(null)
  const { after, onCloseAutoFocus } = useAfterMenu()
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              variant="ghost"
              size="icon-sm"
              aria-label="More writing tools"
              data-tour="write-more"
              className="shrink-0 text-ink-2"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More writing tools</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuItem onSelect={() => after(() => addToWorldFromMenu(trigger.current))}>
          <BookPlusIcon />
          Add to World…
        </DropdownMenuItem>
        <ReadAloudItem after={after} trigger={trigger} />
        <DropdownMenuItem onSelect={() => after(() => openSpeechSetup(null, trigger.current))}>
          <MicIcon />
          Dictation settings…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => after(() => openGoals(trigger.current))}>
          <TargetIcon />
          Goals and sprints…
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={typewriter}
          onSelect={() => after(() => switchTypewriter(!typewriter, setTypewriter))}
        >
          Typewriter scrolling
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ReadAloudItemProps {
  after: (action: () => void) => void
  trigger: RefObject<HTMLButtonElement | null>
}

/** Starts reading aloud (DESIGN.md §8), then the reading bar has focus; or, while it reads, stops it. */
function ReadAloudItem({ after, trigger }: ReadAloudItemProps) {
  const reading = useReadAloud((state) => state.status !== "idle")
  if (!canReadAloud()) return null
  if (reading) {
    return (
      <DropdownMenuItem onSelect={() => after(() => stopReading(true))}>
        <VolumeXIcon />
        Stop reading aloud
      </DropdownMenuItem>
    )
  }
  const start = () => {
    if (startReading()) focusSoon(READ_ALOUD_PLAY)
    else trigger.current?.focus()
  }
  return (
    <DropdownMenuItem onSelect={() => after(start)}>
      <Volume2Icon />
      Read aloud
    </DropdownMenuItem>
  )
}

function PhoneToolbar({ active, format }: ToolbarProps) {
  const { bookId, plan } = useWrite()
  const { chapterId } = useWritePlace()
  const navigate = useNavigate()
  const editor = active?.editor
  return (
    <Bar className={BAR_CLASS}>
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
      <DictateProse editor={editor} size="icon-sm" labelClassName="sr-only" />
      <SprintChip />
      <PhoneMenu active={active} format={format} />
    </Bar>
  )
}

function PhoneMenu({ active, format }: ToolbarProps) {
  const { bookId, plan, unit, setUnit, setPanel, typewriter, setTypewriter } = useWrite()
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
          data-tour="write-views write-focus write-more write-history write-plan-panel write-world-panel write-find write-ai write-today"
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
        <DropdownMenuItem onSelect={() => after(() => setFocusMode(true))}>
          <FocusIcon />
          Focus mode
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={typewriter}
          onSelect={() => after(() => switchTypewriter(!typewriter, setTypewriter))}
        >
          Typewriter scrolling
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={() => after(() => openGoals(trigger.current))}>
          <TargetIcon />
          Goals and sprints…
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
        <DropdownMenuItem onSelect={() => after(() => setPanel("find"))}>
          <SearchIcon />
          Find and replace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => after(() => setPanel("ai"))}>
          <SparklesIcon />
          AI tools
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => after(() => addToWorldFromMenu(trigger.current))}>
          <BookPlusIcon />
          Add to World…
        </DropdownMenuItem>
        <ReadAloudItem after={after} trigger={trigger} />
        <DropdownMenuItem onSelect={() => after(() => openSpeechSetup(null, trigger.current))}>
          <MicIcon />
          Dictation settings…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal text-muted-foreground tabular-nums">
          Today: {formatCount(today.added)} words added, {formatCount(today.removed)} removed
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
