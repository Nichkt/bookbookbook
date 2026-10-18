import { MilestoneIcon, PencilRulerIcon, WandSparklesIcon } from "lucide-react"
import { useRef } from "react"
import { announce, attempt } from "@/app/feedback"
import { useAfterMenu } from "@/components/useAfterMenu"
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
import { setBookStructure } from "@/features/books/mutations"
import { openPlanDialog, type PlanDialog } from "./planDialogs"
import { usePlanContext } from "./planContext"
import { BUILTIN_STRUCTURES, findStructure, type StoryStructure } from "./structures"

/** Radix radio items can't use "" as a value. */
const NONE = "__none"

/**
 * The Plan's Structure menu (DESIGN.md §6 "Templates"): the story structure the book follows, the ribbon that shows
 * it over the Board and Corkboard, the writer's own structures, and planning step by step.
 */
export function StructureMenu() {
  const { db, bookId, structures, ribbonShown, setRibbonShown } = usePlanContext()
  const trigger = useRef<HTMLButtonElement>(null)
  const { after, onCloseAutoFocus } = useAfterMenu()
  const current = structures.current

  const choose = (value: string) => {
    const key = value === NONE ? null : value
    if (key === (current?.key ?? null)) return
    const chosen = findStructure(key, structures.custom)
    void attempt("set story structure", setBookStructure(db, bookId, key)).then(() =>
      announce(chosen ? `Story structure: ${chosen.name}` : "No story structure"),
    )
  }

  const open = (dialog: PlanDialog) => after(() => openPlanDialog(dialog, trigger.current))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="sm"
          aria-label={`Story structure: ${current?.name ?? "none"}`}
          data-tour="plan-structure"
          className="shrink-0"
        >
          <MilestoneIcon />
          <span className="hidden sm:inline">Structure</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuLabel>Story structure</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current?.key ?? NONE} onValueChange={choose}>
          <DropdownMenuRadioItem value={NONE}>None</DropdownMenuRadioItem>
          {BUILTIN_STRUCTURES.map((structure) => (
            <StructureItem key={structure.key} structure={structure} />
          ))}
          {structures.custom.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Your structures</DropdownMenuLabel>
              {structures.custom.map((structure) => (
                <StructureItem key={structure.key} structure={structure} />
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={!!current && ribbonShown}
          disabled={!current}
          onCheckedChange={(checked) => {
            setRibbonShown(checked)
            announce(checked ? "Structure ribbon shown" : "Structure ribbon hidden")
          }}
          onSelect={(event) => event.preventDefault()}
        >
          <span className="grid gap-0.5">
            <span>Show the structure ribbon</span>
            <span className="text-xs text-muted-foreground">On the Board and Corkboard</span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open("structures")}>
          <PencilRulerIcon />
          Your structures…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("wizard")}>
          <WandSparklesIcon />
          Plan step by step…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StructureItem({ structure }: { structure: StoryStructure }) {
  return (
    <DropdownMenuRadioItem value={structure.key}>
      <span className="grid gap-0.5">
        <span>{structure.name}</span>
        {structure.summary && <span className="text-xs text-muted-foreground">{structure.summary}</span>}
      </span>
    </DropdownMenuRadioItem>
  )
}
