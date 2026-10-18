import { createElement } from "react"
import { cn } from "@/lib/utils"
import { initials, type CodexEntry } from "./codexData"
import { typeIconOf } from "./typeIcons"

/** An entry's initials on its color. Decorative: the name is always beside it. */
export function Portrait({
  entry,
  className,
}: {
  entry: Pick<CodexEntry, "name" | "named" | "color">
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white select-none", className)}
      style={{ background: entry.color }}
    >
      {entry.named ? initials(entry.name) : "?"}
    </span>
  )
}

/** A type's icon, by its lucide name; null for the entries whose type is gone. */
export function TypeIcon({ icon, className }: { icon: string | null; className?: string }) {
  return createElement(typeIconOf(icon), { "aria-hidden": true, className })
}
