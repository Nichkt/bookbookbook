import { create } from "zustand"
import { IS_MAC } from "@/lib/keys"

/*
 * What the AI panel's dialogs and Ctrl+J need outside React (DESIGN.md §9): which dialog is open and where focus goes
 * after it, and a run asked for before the panel could take it.
 */

/** The AI panel's heading, where focus goes as the panel opens from the toolbar. */
export const AI_PANEL_HEADING = "[data-ai-panel-heading]"
/** The button that sets the AI tools up, while they aren't. */
export const AI_SETUP_BUTTON = "[data-ai-setup]"
/** Ctrl+J (Cmd+J on a Mac): Continue. */
export const CONTINUE_KEYS = "Mod+J"

type AiDialog = "settings" | "tools"

interface AiDialogsState {
  open: AiDialog | null
  /** Bumped each time a dialog opens, so its form starts afresh. */
  session: number
  /** Where focus goes as the dialog closes: the control that opened it. */
  returnFocus: HTMLElement | null
}

export const useAiDialogs = create<AiDialogsState>(() => ({ open: null, session: 0, returnFocus: null }))

const openDialog = (open: AiDialog, returnFocus: HTMLElement | null) =>
  useAiDialogs.setState((state) => ({ open, session: state.session + 1, returnFocus }))

export const openAiSettings = (returnFocus: HTMLElement | null) => openDialog("settings", returnFocus)
export const openCustomTools = (returnFocus: HTMLElement | null) => openDialog("tools", returnFocus)
export const closeAiDialog = () => useAiDialogs.setState({ open: null })

/** Puts focus back where the dialog was opened from. False when that's gone, so the dialog's own default stands. */
export function returnFromAiDialog(): boolean {
  const { returnFocus } = useAiDialogs.getState()
  if (!returnFocus?.isConnected) return false
  returnFocus.focus()
  return true
}

/** A run asked for by a shortcut, which the panel starts once it's on the page and has what it needs. */
export interface PendingRun {
  /** Bumped per request, so the same tool asked for twice runs twice. */
  id: number
  tool: string
  /** When it was asked for, as Date.now(). */
  at: number
}

export const usePendingRun = create<{ pending: PendingRun | null }>(() => ({ pending: null }))

let runRequests = 0

export const requestRun = (tool: string) =>
  usePendingRun.setState({ pending: { id: ++runRequests, tool, at: Date.now() } })

/** Takes the pending run, so it runs once. */
export function takePendingRun(): PendingRun | null {
  const { pending } = usePendingRun.getState()
  if (pending) usePendingRun.setState({ pending: null })
  return pending
}

/** Whether a keydown is Ctrl+J (Cmd+J on a Mac), whatever the keyboard layout. */
export const isContinueShortcut = (event: KeyboardEvent) =>
  (IS_MAC ? event.metaKey : event.ctrlKey) &&
  !event.shiftKey &&
  !event.altKey &&
  (event.code === "KeyJ" || event.key.toLowerCase() === "j")
