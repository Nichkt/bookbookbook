import { useEffect, useLayoutEffect, useRef } from "react"
import { create } from "zustand"
import { IS_MAC } from "@/lib/keys"
import type { PaletteCommand } from "./commands"

/** Opens and closes the command palette, everywhere in the app. */
export const PALETTE_KEYS = "Mod+K"

export const isPaletteShortcut = (event: KeyboardEvent) =>
  (IS_MAC ? event.metaKey : event.ctrlKey) &&
  !event.shiftKey &&
  !event.altKey &&
  (event.code === "KeyK" || event.key.toLowerCase() === "k")

/** What a screen adds to the palette while it's showing. */
export interface PaletteSource {
  /** The screen's own commands, like the Write screen's views and tools. */
  commands?: () => PaletteCommand[]
  /** Opens a chapter the screen's own way: the Plan pops it out, and Write scrolls to it. */
  openChapter?: (chapterId: string) => void
  /** Goes to a scene the screen's own way. */
  openScene?: (sceneId: string) => void
  /** Opens a World entry the screen's own way: Write shows it in the side panel. */
  openEntry?: (entryId: string) => void
}

interface PaletteState {
  open: boolean
  /** Counts its openings, so each starts afresh: even one opened again as it fades away, which never quite closed. */
  session: number
  /** What had focus as the palette opened, if anything did: where focus goes back to, and what commands act on. */
  from: HTMLElement | null
  /** The command picked, which runs once the palette has closed and focus is back where it was. */
  chosen: PaletteCommand | null
  /** The showing screens' sources, by screen. */
  sources: ReadonlyMap<string, { readonly current: PaletteSource }>
}

export const usePalette = create<PaletteState>(() => ({
  open: false,
  session: 0,
  from: null,
  chosen: null,
  sources: new Map(),
}))

/**
 * Opens the palette. Opened again as it fades away, focus still goes back where it first came from; fading away to
 * run a command, the command comes first.
 */
export function openPalette(from: HTMLElement | null) {
  const fading = document.querySelector("[data-palette]")
  usePalette.setState((state) => {
    if (fading && state.chosen) return state
    const again = !!fading && !!from && fading.contains(from)
    return { open: true, session: state.session + 1, from: again ? state.from : from, chosen: null }
  })
}

/** Closes the palette, then runs `chosen` if a command was picked. */
export const closePalette = (chosen: PaletteCommand | null = null) => usePalette.setState({ open: false, chosen })

type Opener = "openChapter" | "openScene" | "openEntry"

/** The showing screen's own way to open a chapter, a scene or an entry, if it has one. */
export function screenHandler<K extends Opener>(key: K): PaletteSource[K] {
  for (const source of usePalette.getState().sources.values()) {
    const handler = source.current[key]
    if (handler) return handler
  }
  return undefined
}

/** The showing screens' own commands, as they are now. */
export const screenCommands = (sources = usePalette.getState().sources): PaletteCommand[] =>
  [...sources.values()].flatMap((source) => source.current.commands?.() ?? [])

/**
 * Adds a screen's commands to the palette while it's mounted. The palette asks for them as it opens, so they can
 * close over the screen's latest state.
 */
export function usePaletteSource(id: string, source: PaletteSource) {
  const ref = useRef(source)
  useLayoutEffect(() => {
    ref.current = source
  })
  useEffect(() => {
    usePalette.setState((state) => ({ sources: new Map(state.sources).set(id, ref) }))
    return () =>
      usePalette.setState((state) => {
        // Another mount of the same screen may have taken its place already.
        if (state.sources.get(id) !== ref) return state
        const sources = new Map(state.sources)
        sources.delete(id)
        return { sources }
      })
  }, [id])
}
