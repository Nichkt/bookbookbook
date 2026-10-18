import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { THEME_ICONS, THEME_LABELS, THEMES, useTheme, type Theme } from "./theme"

/** Light, Sepia or Dark: one button with a menu until there's room for all three words. */
export function ThemeSwitcher() {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const Current = THEME_ICONS[theme]
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Theme" className="xl:hidden">
            <Current aria-hidden="true" />
            <span className="sr-only">Theme: {THEME_LABELS[theme]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            {THEMES.map((t) => {
              const Icon = THEME_ICONS[t]
              return (
                <DropdownMenuRadioItem key={t} value={t}>
                  <Icon aria-hidden="true" />
                  {THEME_LABELS[t]}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={0}
        value={theme}
        // Radix reports "" when the pressed item is clicked again; a theme must stay selected.
        onValueChange={(value) => value && setTheme(value as Theme)}
        aria-label="Theme"
        className="hidden xl:flex"
      >
        {THEMES.map((t) => (
          <ToggleGroupItem key={t} value={t} className="px-2.5 text-xs">
            {THEME_LABELS[t]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  )
}
