import { useCallback, useMemo } from "react"
import { usePref } from "@/db/prefs"

export const PLAN_VIEWS = ["board", "outline"] as const
export type PlanView = (typeof PLAN_VIEWS)[number]
export const isPlanView = (value: unknown): value is PlanView => PLAN_VIEWS.includes(value as PlanView)

export const viewPrefKey = (bookId: string) => `plan.view:${bookId}`

/** What cards and outline rows show (DESIGN.md §6 "Display"). */
export const DISPLAY_FIELDS = [
  { key: "summary", label: "Summary" },
  { key: "beats", label: "Beats" },
  { key: "pov", label: "POV" },
  { key: "status", label: "Status" },
  { key: "words", label: "Word count" },
  { key: "labels", label: "Labels" },
  { key: "threads", label: "Threads" },
  { key: "present", label: "Characters present" },
  { key: "location", label: "Location" },
  { key: "time", label: "Story time" },
  { key: "templateBeat", label: "Template beat" },
] as const

export type DisplayField = (typeof DISPLAY_FIELDS)[number]["key"]
const ALL_FIELDS: DisplayField[] = DISPLAY_FIELDS.map((field) => field.key)
const isField = (value: unknown): value is DisplayField => ALL_FIELDS.includes(value as DisplayField)

/** How a template beat reads: until templates arrive (DESIGN.md §6 "Templates"), its key made readable. */
export function templateBeatName(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const PRESETS = {
  compact: ["status", "pov"],
  standard: ["status", "pov", "summary", "words", "threads"],
  detailed: ALL_FIELDS,
} satisfies Record<string, readonly DisplayField[]>

export type PresetName = keyof typeof PRESETS
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[]
export type DisplayPreset = PresetName | "custom"

const DEFAULT_PRESET: Record<PlanView, PresetName> = { board: "standard", outline: "detailed" }

export interface Display {
  preset: DisplayPreset
  fields: ReadonlySet<DisplayField>
}

export const displayPrefKey = (bookId: string, view: PlanView) => `plan.display:${bookId}:${view}`

const sameFields = (a: ReadonlySet<DisplayField>, b: readonly DisplayField[]) =>
  a.size === b.length && b.every((field) => a.has(field))

/** Reads the stored `{preset, fields?}`; anything unreadable falls back to the view's default. */
export function parseDisplay(raw: string | null, view: PlanView): Display {
  let stored: { preset?: unknown; fields?: unknown } = {}
  try {
    if (raw) stored = JSON.parse(raw) as typeof stored
  } catch {
    // Fall back to the default below.
  }
  if (stored.preset === "custom" && Array.isArray(stored.fields)) {
    return { preset: "custom", fields: new Set(stored.fields.filter(isField)) }
  }
  const preset = PRESET_NAMES.includes(stored.preset as PresetName) ? (stored.preset as PresetName) : DEFAULT_PRESET[view]
  return { preset, fields: new Set(PRESETS[preset]) }
}

/** Turning one field on or off. Lands on a preset again when the fields match one. */
export function toggleDisplayField(display: Display, field: DisplayField): string {
  const fields = new Set(display.fields)
  if (fields.has(field)) fields.delete(field)
  else fields.add(field)
  const preset = PRESET_NAMES.find((name) => sameFields(fields, PRESETS[name]))
  return JSON.stringify(preset ? { preset } : { preset: "custom", fields: ALL_FIELDS.filter((key) => fields.has(key)) })
}

export function useDisplay(bookId: string, view: PlanView) {
  const { value, setValue } = usePref(displayPrefKey(bookId, view))
  const display = useMemo(() => parseDisplay(value, view), [value, view])
  const setPreset = useCallback((preset: PresetName) => setValue(JSON.stringify({ preset })), [setValue])
  const toggleField = useCallback((field: DisplayField) => setValue(toggleDisplayField(display, field)), [display, setValue])
  return { display, setPreset, toggleField }
}
