import {
  FilterIcon,
  FolderPlusIcon,
  MilestoneIcon,
  PencilRulerIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  WandSparklesIcon,
} from "lucide-react"
import { useId } from "react"
import { Link, useLocation } from "react-router"
import { announce, attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PaletteCommand } from "@/features/palette/commands"
import { usePaletteSource } from "@/features/palette/paletteStore"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import {
  DISPLAY_FIELDS,
  DISPLAY_VIEWS,
  PLAN_VIEWS,
  PRESET_NAMES,
  VIEW_LABELS,
  type PresetName,
} from "./display"
import { activeFilterCount } from "./filters"
import { createAct, createChapter } from "./mutations"
import { usePlanContext, type PlanContextValue } from "./planContext"
import { openPlanDialog } from "./planDialogs"
import { STATUS_OPTIONS } from "./status"
import { StructureMenu } from "./StructureMenu"
import { VIEW_ICONS } from "./viewIcons"

const PRESET_LABELS: Record<PresetName, string> = { compact: "Compact", standard: "Standard", detailed: "Detailed" }
const isPreset = (value: string): value is PresetName => PRESET_NAMES.includes(value as PresetName)

/** Radix Select can't use "" as a value. */
const ANY = "__any"

export function PlanToolbar() {
  const context = usePlanContext()
  const { db, bookId, book, plan, view, focusItem, showChapter, showNewChapter } = context
  const location = useLocation()

  const addAct = async () => {
    const id = await attempt("add act", createAct(db, bookId))
    if (!id) return
    focusItem("act", id)
    announce(plan.hasActs ? "Act added at the end" : "Act added. It holds every chapter for now.")
  }

  const addChapter = async (opener: HTMLElement | null = null) => {
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: null }))
    if (!id) return
    // Titled where the view shows titles: in the Outline's row, on the index card, else in the pop-out.
    if (view === "outline") focusItem("chapter", id)
    else if (view === "corkboard") focusSoon(byData("index-title", id))
    else showNewChapter(id, opener)
  }

  usePaletteSource("plan", {
    commands: () => planCommands(context, { addAct: () => void addAct(), addChapter: () => void addChapter() }),
    openChapter: (id) => showChapter(id),
  })

  return (
    // Taller on touch screens, to fit 44px targets. The Outline's scroll margins sit below it.
    <div data-sticky-top="" className="sticky top-14 z-20 flex h-12 items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur sm:gap-2 sm:px-6 pointer-coarse:h-14">
      <nav aria-label="Plan views" data-tour="plan-views" className="flex shrink-0 items-center rounded-lg bg-muted p-0.5">
        {PLAN_VIEWS.map((name) => {
          const Icon = VIEW_ICONS[name]
          const current = name === view
          return (
            <Link
              key={name}
              to={{ pathname: `/b/${bookId}/plan/${name}`, search: location.search }}
              state={location.state}
              replace
              aria-current={current ? "page" : undefined}
              title={VIEW_LABELS[name]}
              className={cn(
                "flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors pointer-coarse:h-11 pointer-coarse:min-w-11",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                current ? "bg-background text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {/* Icons alone on phones, so the toolbar fits; on mid-size screens, only the current view's name. */}
              <span className={current ? "sr-only sm:not-sr-only" : "sr-only xl:not-sr-only"}>{VIEW_LABELS[name]}</span>
            </Link>
          )
        })}
      </nav>
      {DISPLAY_VIEWS.includes(view) && <DisplayMenu />}
      <FilterMenu />
      <StructureMenu />
      <p className="ml-auto hidden shrink-0 text-xs text-muted-foreground tabular-nums lg:block">
        {plan.chapters.length} {plan.chapters.length === 1 ? "chapter" : "chapters"} · {formatCount(plan.words)}
        {book.target_words ? ` / ${formatCount(book.target_words)}` : ""} words
      </p>
      <div data-tour="plan-add" className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-2">
        <Button variant="outline" size="sm" onClick={() => void addAct()}>
          <PlusIcon />
          Act
        </Button>
        <Button size="sm" onClick={(event) => void addChapter(event.currentTarget)}>
          <PlusIcon />
          Chapter
        </Button>
      </div>
    </div>
  )
}

/** The Plan's part of the command palette (DESIGN.md §4): adding, and the Structure menu's choices. */
function planCommands(
  { structures, ribbonShown, setRibbonShown }: PlanContextValue,
  add: { addAct: () => void; addChapter: () => void },
): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    {
      id: "plan:add-chapter",
      label: "Add a chapter",
      group: "Actions",
      icon: PlusIcon,
      keywords: ["new chapter", "create"],
      movesFocus: true,
      run: add.addChapter,
    },
    {
      id: "plan:add-act",
      label: "Add an act",
      group: "Actions",
      icon: FolderPlusIcon,
      keywords: ["new act", "part", "create"],
      movesFocus: true,
      run: add.addAct,
    },
  ]
  if (structures.current) {
    commands.push({
      id: "plan:ribbon",
      label: "Show the structure ribbon",
      group: "Actions",
      icon: MilestoneIcon,
      checked: ribbonShown,
      keywords: ["story structure", "moments", "beats", "board", "corkboard"],
      run: () => {
        setRibbonShown(!ribbonShown)
        announce(ribbonShown ? "Structure ribbon hidden" : "Structure ribbon shown")
      },
    })
  }
  commands.push(
    {
      id: "plan:structures",
      label: "Your story structures?",
      group: "Actions",
      icon: PencilRulerIcon,
      keywords: ["story structure", "template", "make your own", "moments", "beats"],
      run: (from) => openPlanDialog("structures", from),
    },
    {
      id: "plan:wizard",
      label: "Plan step by step?",
      group: "Actions",
      icon: WandSparklesIcon,
      keywords: ["wizard", "questions", "guided", "help me plan"],
      run: (from) => openPlanDialog("wizard", from),
    },
  )
  return commands
}

function DisplayMenu() {
  const { display, setPreset, toggleField } = usePlanContext()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Display options" data-tour="plan-display" className="shrink-0">
          <SlidersHorizontalIcon />
          <span className="hidden sm:inline">Display</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Detail</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={display.preset} onValueChange={(value) => isPreset(value) && setPreset(value)}>
          {PRESET_NAMES.map((name) => (
            <DropdownMenuRadioItem key={name} value={name}>
              {PRESET_LABELS[name]}
            </DropdownMenuRadioItem>
          ))}
          {display.preset === "custom" && (
            <DropdownMenuRadioItem value="custom" disabled>
              Custom
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        {DISPLAY_FIELDS.map((field) => (
          <DropdownMenuCheckboxItem
            key={field.key}
            checked={display.fields.has(field.key)}
            onCheckedChange={() => toggleField(field.key)}
            // Keep the menu open to toggle several.
            onSelect={(event) => event.preventDefault()}
          >
            {field.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilterMenu() {
  const { plan, filters, setFilter, clearFilters, filtering, matchCount } = usePlanContext()
  const titleId = useId()
  const count = activeFilterCount(filters)
  const entryOptions = (typeKey: string) =>
    (plan.entriesByType.get(typeKey) ?? []).map((entry) => ({ value: entry.id, label: entry.name, color: entry.color }))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={filtering ? "secondary" : "ghost"}
          size="sm"
          aria-label={count > 0 ? `Filter, ${count} on` : "Filter"}
          data-tour="plan-filter"
          className="shrink-0"
        >
          <FilterIcon />
          <span className="hidden sm:inline">Filter</span>
          {count > 0 && (
            <span className="grid size-4 place-items-center rounded-full bg-primary text-[0.625rem] font-semibold text-primary-foreground tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-labelledby={titleId} className="w-72">
        <PopoverHeader>
          <PopoverTitle id={titleId}>Filter chapters</PopoverTitle>
          <PopoverDescription>Chapters that don't match are dimmed.</PopoverDescription>
        </PopoverHeader>
        <div className="mt-1 grid gap-3">
          <FilterSelect
            label="Point of view"
            value={filters.pov}
            options={entryOptions("characters")}
            onChange={(value) => setFilter("pov", value)}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS.map((option) => ({ value: option.key, label: option.label, dot: option.dot }))}
            onChange={(value) => setFilter("status", value)}
          />
          <FilterSelect
            label="Story point"
            value={filters.thread}
            options={entryOptions("plot_threads")}
            onChange={(value) => setFilter("thread", value)}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {filtering ? `${matchCount} of ${plan.chapters.length} chapters match` : `${plan.chapters.length} chapters`}
          </p>
          <Button variant="ghost" size="sm" disabled={!filtering} onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface FilterOption {
  value: string
  label: string
  /** A palette color, for entries. */
  color?: string
  /** A status dot class. */
  dot?: string
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: FilterOption[]
  onChange: (value: string | null) => void
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? null : next)}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {(option.color || option.dot) && (
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", option.dot)}
                  style={option.color ? { background: option.color } : undefined}
                />
              )}
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
