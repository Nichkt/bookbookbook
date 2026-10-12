import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { THEMES, useTheme, type Theme } from "./theme"

const LABELS: Record<Theme, string> = { light: "Light", sepia: "Sepia", dark: "Dark" }

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
      {THEMES.map((t) => (
        <ToggleGroupItem key={t} value={t} className="px-2.5 text-xs">
          {LABELS[t]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
