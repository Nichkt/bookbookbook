import {
  CalendarIcon,
  CircleDashedIcon,
  FeatherIcon,
  KeyRoundIcon,
  MapPinIcon,
  ShapesIcon,
  ShieldIcon,
  SparklesIcon,
  SplineIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { initials, type CodexEntry } from "./codexData"

/** Codex type icons by the lucide name stored with the type (see CODEX_TYPES and CUSTOM_TYPE_ICON). */
const TYPE_ICONS = {
  "user-round": UserRoundIcon,
  "map-pin": MapPinIcon,
  "key-round": KeyRoundIcon,
  shield: ShieldIcon,
  sparkles: SparklesIcon,
  calendar: CalendarIcon,
  spline: SplineIcon,
  feather: FeatherIcon,
  shapes: ShapesIcon,
} satisfies Record<string, LucideIcon>

const isTypeIcon = (name: string): name is keyof typeof TYPE_ICONS => Object.hasOwn(TYPE_ICONS, name)

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
  const Icon = icon === null ? CircleDashedIcon : isTypeIcon(icon) ? TYPE_ICONS[icon] : ShapesIcon
  return <Icon aria-hidden="true" className={className} />
}
