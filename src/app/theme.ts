import { create } from "zustand"

export const THEMES = ["light", "sepia", "dark"] as const
export type Theme = (typeof THEMES)[number]

// Same key and fallback as public/theme-init.js, which applies the theme before first paint.
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
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Storage blocked: the theme still applies for this session.
    }
    set({ theme })
  },
}))
