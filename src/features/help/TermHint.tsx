import { CircleHelpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { termById } from "./glossary"
import { openGlossary } from "./helpStore"

/** A small "?" beside a label that opens the glossary at the term (DESIGN.md §17a). */
export function TermHint({ term, className }: { term: string; className?: string }) {
  const entry = termById.get(term)
  if (!entry) return null
  const label = `What does “${entry.term}” mean?`
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-term-hint={term}
      onClick={(event) => openGlossary(term, event.currentTarget)}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 transition-colors outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-11 pointer-coarse:-m-3",
        className,
      )}
    >
      <CircleHelpIcon aria-hidden="true" className="size-3.5" />
    </button>
  )
}
