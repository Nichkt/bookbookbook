import { PlusIcon, XIcon } from "lucide-react"
import type { KeyboardEvent } from "react"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useDraft } from "@/components/useDraft"
import { byData, focusSoon } from "@/lib/focus"
import { isComposing } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { addBeat, deleteBeat, moveBeat, updateBeat } from "./mutations"
import { usePlanContext } from "./planContext"
import type { PlanBeatRow, PlanChapter } from "./planData"

const focusBeat = (id: string) => focusSoon(byData("beat-input", id))
const focusAddButton = (chapterId: string) => focusSoon(byData("beats-add", chapterId))

/**
 * The chapter's beats as a checklist (DESIGN.md §6). Enter adds the next beat, Backspace in an empty one removes
 * it, Alt+↑/↓ reorders.
 */
export function BeatsEditor({ chapter, labelId }: { chapter: PlanChapter; labelId: string }) {
  const { db } = usePlanContext()

  const addAt = async (index?: number) => {
    const id = await attempt("add beat", addBeat(db, chapter.id, index))
    if (id) focusBeat(id)
  }

  return (
    <div className="grid gap-1">
      {chapter.beats.length > 0 && (
        <ol aria-labelledby={labelId} className="grid gap-0.5">
          {chapter.beats.map((beat, index) => (
            <BeatRow key={beat.id} chapter={chapter} beat={beat} index={index} onAddAfter={() => addAt(index + 1)} />
          ))}
        </ol>
      )}
      <Button
        variant="ghost"
        size="sm"
        data-beats-add={chapter.id}
        onClick={() => void addAt()}
        className="justify-self-start text-muted-foreground"
      >
        <PlusIcon />
        Add beat
      </Button>
    </div>
  )
}

interface BeatRowProps {
  chapter: PlanChapter
  beat: Readonly<PlanBeatRow>
  index: number
  onAddAfter: () => Promise<void>
}

function BeatRow({ chapter, beat, index, onAddAfter }: BeatRowProps) {
  const { db } = usePlanContext()
  const draft = useDraft(beat.text ?? "", (text) => updateBeat(db, beat.id, { text }))
  const beats = chapter.beats
  const name = `Beat ${index + 1}`

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event.nativeEvent)) return
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    if (event.key === "Enter" && plain) {
      event.preventDefault()
      await draft.flush()
      await onAddAfter()
    } else if (event.key === "Backspace" && plain && draft.value === "") {
      // An empty beat holds nothing to undo.
      event.preventDefault()
      const neighbor = beats[index - 1] ?? beats[index + 1]
      if (!(await attempt("delete beat", deleteBeat(db, beat.id)))) return
      if (neighbor) focusBeat(neighbor.id)
      else focusAddButton(chapter.id)
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault()
      const target = index + (event.key === "ArrowUp" ? -1 : 1)
      if (target < 0 || target >= beats.length) {
        announce(target < 0 ? "Already the first beat." : "Already the last beat.")
        return
      }
      await draft.flush()
      if (!(await attempt("move beat", moveBeat(db, beat.id, target).then(() => true)))) return
      focusBeat(beat.id)
      announce(`Moved to beat ${target + 1} of ${beats.length}`)
    }
  }

  const remove = async () => {
    const neighbor = beats[index + 1] ?? beats[index - 1]
    const changes = await attempt("delete beat", deleteBeat(db, beat.id))
    if (!changes) return
    if (neighbor) focusBeat(neighbor.id)
    else focusAddButton(chapter.id)
    offerUndo(db, `Deleted ${beat.text?.trim() ? `“${beat.text.trim()}”` : "a beat"}`, changes, () => focusBeat(beat.id))
  }

  return (
    <li className="group/beat flex items-center gap-1.5">
      <Checkbox
        checked={!!beat.done}
        aria-label={`${name} done`}
        onCheckedChange={(checked) => void attempt("tick beat", updateBeat(db, beat.id, { done: checked === true }))}
        // On touch screens its hit area grows to 44px, so keep that clear of the field.
        className="ml-1 pointer-coarse:mr-2"
      />
      <Input
        data-beat-input={beat.id}
        aria-label={name}
        placeholder="What happens…"
        value={draft.value}
        onChange={(event) => draft.onChange(event.target.value)}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onKeyDown={(event) => void onKeyDown(event)}
        className={cn(
          "h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-input dark:bg-transparent",
          beat.done && "text-muted-foreground line-through",
        )}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${name.toLowerCase()}`}
        onClick={() => void remove()}
        className="text-muted-foreground opacity-0 group-focus-within/beat:opacity-100 group-hover/beat:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <XIcon />
      </Button>
    </li>
  )
}
