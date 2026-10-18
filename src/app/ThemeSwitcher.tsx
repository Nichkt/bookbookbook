import { CoffeeIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { THEMES, useTheme, type Theme } from "./theme"

const LABELS: Record<Theme, string> = { light: "Light", sepia: "Sepia", dark: "Dark" }
const ICONS: Record<Theme, LucideIcon> = { light: SunIcon, sepia: CoffeeIcon, dark: MoonIcon }

/** Light, Sepia or Dark: icons until there's room for the words. */
export function ThemeSwitcher() {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      value={theme}
      // Radix reports "" when the pressed item is clicked again; a theme must stay selected.
      onValueChange={(value) => value && setTheme(value as Theme)}
      aria-label="Theme"
    >
      {THEMES.map((t) => {
        const Icon = ICONS[t]
        return (
          <ToggleGroupItem key={t} value={t} title={LABELS[t]} className="px-2 text-xs xl:px-2.5">
            <Icon aria-hidden="true" className="xl:hidden" />
            <span className="sr-only xl:not-sr-only">{LABELS[t]}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
