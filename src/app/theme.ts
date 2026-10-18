import { CoffeeIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react"
import { create } from "zustand"

export const THEMES = ["light", "sepia", "dark"] as const
export type Theme = (typeof THEMES)[number]

export const THEME_LABELS: Record<Theme, string> = { light: "Light", sepia: "Sepia", dark: "Dark" }
export const THEME_ICONS: Record<Theme, LucideIcon> = { light: SunIcon, sepia: CoffeeIcon, dark: MoonIcon }
/** Each theme's header color (`--surface` in index.css), for the browser's or the installed app's title bar. */
export const THEME_COLORS: Record<Theme, string> = { light: "#fbf8f2", sepia: "#f6edd9", dark: "#1b1e24" }

// Same key, fallback and colors as public/theme-init.js, which applies the theme before first paint.
const STORAGE_KEY = "bbb.theme"

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme)

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useTheme = create<ThemeState>((set) => ({
  theme: isTheme(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : "light",
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme])
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Storage blocked: the theme still applies for this session.
    }
    set({ theme })
  },
}))
