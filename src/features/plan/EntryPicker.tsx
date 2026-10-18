import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { useId, useState } from "react"
import { attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { CodexTypeKey } from "@/db/codexTypes"
import { createCodexEntry } from "@/features/codex/mutations"
import { nextColor } from "@/lib/palette"
import { useChapterDetails } from "./planContext"
import type { PlanEntry } from "./planData"

const NONE = "__none"
const CREATE = "__create"

/** Matches on the entry's name (cmdk keywords), not its id: names first, then anywhere in the name. */
function filterByName(_value: string, search: string, keywords?: string[]) {
  const query = search.trim().toLowerCase()
  if (!query) return 1
  let best = 0
  for (const keyword of keywords ?? []) {
    const name = keyword.toLowerCase()
    if (name.startsWith(query)) best = 1
    else if (name.includes(query)) best = Math.max(best, 0.5)
  }
  return best
}

interface EntryPickerProps {
  /** The id of the visible label, so the button reads as "POV, Mara". */
  labelId: string
  typeKey: CodexTypeKey
  /** For "Create “X” as a new …". */
  noun: string
  multiple?: boolean
  value: readonly string[]
  onChange: (ids: string[]) => Promise<unknown> | void
  /** Shown when nothing is chosen. */
  emptyText: string
}

/**
 * Picks codex entries for a chapter (DESIGN.md §6): type to filter, Enter to choose, or create a new entry from the
 * text typed. Several can be chosen with `multiple`; the list then stays open.
 */
export function EntryPicker({ labelId, typeKey, noun, multiple, value, onChange, emptyText }: EntryPickerProps) {
  const { db, bookId, plan } = useChapterDetails()
  const triggerId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const entries = plan.entriesByType.get(typeKey) ?? []
  const chosen = value.map((id) => plan.entries.get(id)).filter((entry): entry is PlanEntry => !!entry)
  const name = query.trim()
  const exact = entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase())

  const setOpenAndReset = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }

  const choose = (id: string | null) => {
    if (multiple) {
      if (!id) return
      void attempt("pick entry", Promise.resolve(onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])))
      setQuery("")
    } else {
      void attempt("pick entry", Promise.resolve(onChange(id ? [id] : [])))
      setOpenAndReset(false)
    }
  }

  const create = async () => {
    if (!name) return
    const color = nextColor(entries.map((entry) => entry.color))
    const id = await attempt("create entry", createCodexEntry(db, { bookId, typeKey, name, color }))
    if (id) choose(id)
  }

  return (
    <Popover open={open} onOpenChange={setOpenAndReset}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          variant="outline"
          aria-labelledby={`${labelId} ${triggerId}`}
          className="h-auto min-h-8 w-full justify-between gap-2 px-2.5 py-1 font-normal"
        >
          {chosen.length > 0 ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              {chosen.map((entry) => (
                <span key={entry.id} className="inline-flex min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} />
                  <span className="truncate">{entry.name}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">{emptyText}</span>
          )}
          <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-labelledby={labelId} className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command filter={filterByName}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={`Find or create a ${noun}…`} />
          <CommandList>
            <CommandEmpty>No {noun} by that name.</CommandEmpty>
            <CommandGroup>
              {!multiple && (
                <CommandItem value={NONE} keywords={["none", emptyText]} data-checked={value.length === 0} onSelect={() => choose(null)}>
                  <span className="text-muted-foreground">{emptyText}</span>
                </CommandItem>
              )}
              {entries.map((entry) => {
                const selected = value.includes(entry.id)
                return (
                  <CommandItem
                    key={entry.id}
                    value={entry.id}
                    keywords={[entry.name]}
                    data-checked={selected}
                    onSelect={() => choose(entry.id)}
                  >
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} />
                    <span className="truncate">{entry.name}</span>
                    {selected && <span className="sr-only">(chosen)</span>}
                  </CommandItem>
                )
              })}
              {name && !exact && (
                <CommandItem value={CREATE} forceMount onSelect={() => void create()} className="text-ink">
                  <PlusIcon aria-hidden="true" />
                  <span className="truncate">
                    Create “{name}” as a new {noun}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
