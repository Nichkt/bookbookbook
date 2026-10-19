import {
  ArrowDownIcon,
  ArrowUpIcon,
  CombineIcon,
  EllipsisIcon,
  FolderMinusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRef, type Ref } from "react"
import { attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { byData } from "@/lib/focus"
import { deleteActWithUndo, foldAct, moveActBy } from "./commands"
import { createChapter } from "./mutations"
import { usePlanContext } from "./planContext"
import type { PlanGroup } from "./planData"
import { actLabel } from "./status"

interface ActMenuProps {
  group: PlanGroup
  /** Show keyboard shortcuts (the Outline, where they work). */
  shortcuts?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Where focus goes when the menu closes without running a command. Default: its button. */
  returnFocus?: () => void
  triggerTabIndex?: number
  triggerRef?: Ref<HTMLButtonElement>
}

/** The ⋯ menu on an act, on the Board and in the Outline. */
export function ActMenu({ group, shortcuts, open, onOpenChange, returnFocus, triggerTabIndex, triggerRef }: ActMenuProps) {
  const { db, bookId, plan, focusItem, view, showNewChapter } = usePlanContext()
  // Commands place focus themselves; the menu then mustn't pull it back to its button.
  const commandRan = useRef(false)
  const act = group.act
  if (!act) return null
  const acts = plan.groups.filter((candidate) => candidate.act)
  const position = acts.indexOf(group)
  const label = actLabel(group, plan.hasActs)

  const run = (command: () => Promise<void>) => {
    commandRan.current = true
    void command()
  }

  const addChapter = async () => {
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: act.id }))
    if (!id) return
    // Left out, it gives focus to the act's add tile: the menu that added it is gone.
    if (view === "board") showNewChapter(id, document.querySelector<HTMLElement>(byData("add-chapter", group.key)))
    else focusItem("chapter", id)
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-sm"
          tabIndex={triggerTabIndex}
          aria-label={`More for ${label}`}
          className="text-muted-foreground"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onCloseAutoFocus={(event) => {
          if (commandRan.current) {
            commandRan.current = false
            event.preventDefault()
          } else if (returnFocus) {
            event.preventDefault()
            returnFocus()
          }
        }}
      >
        <DropdownMenuItem onSelect={() => run(addChapter)}>
          <PlusIcon />
          Add chapter at the end
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={position <= 0} onSelect={() => run(() => moveActBy(db, plan, act.id, -1, focusItem))}>
          <ArrowUpIcon />
          Move act up
          {shortcuts && <DropdownMenuShortcut>Alt+↑</DropdownMenuShortcut>}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={position === -1 || position >= acts.length - 1}
          onSelect={() => run(() => moveActBy(db, plan, act.id, 1, focusItem))}
        >
          <ArrowDownIcon />
          Move act down
          {shortcuts && <DropdownMenuShortcut>Alt+↓</DropdownMenuShortcut>}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={position <= 0} onSelect={() => run(() => foldAct(db, plan, act.id, focusItem))}>
          <CombineIcon />
          Merge into the act above
          {shortcuts && <DropdownMenuShortcut>Tab</DropdownMenuShortcut>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {group.chapters.length === 0 ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => run(() => deleteActWithUndo(db, plan, act.id, "keep", focusItem))}
          >
            <Trash2Icon />
            Delete act
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => run(() => deleteActWithUndo(db, plan, act.id, "keep", focusItem))}>
              <FolderMinusIcon />
              Delete act, keep its chapters
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => run(() => deleteActWithUndo(db, plan, act.id, "trash", focusItem))}
            >
              <Trash2Icon />
              Delete act and its chapters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
