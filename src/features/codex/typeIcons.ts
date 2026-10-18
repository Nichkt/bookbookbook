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

/** A type's icon, by its lucide name; a dashed circle for the entries whose type is gone. */
export const typeIconOf = (icon: string | null): LucideIcon =>
  icon === null ? CircleDashedIcon : isTypeIcon(icon) ? TYPE_ICONS[icon] : ShapesIcon
