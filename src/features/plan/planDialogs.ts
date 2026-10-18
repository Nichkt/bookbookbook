import { create } from "zustand"

/** The Plan's dialogs: the writer's own story structures, and planning step by step. */
export type PlanDialog = "structures" | "wizard"

interface PlanDialogState {
  dialog: PlanDialog | null
  /** What to focus when the dialog closes: the control that opened it. */
  returnFocus: HTMLElement | null
}

export const usePlanDialogs = create<PlanDialogState>(() => ({ dialog: null, returnFocus: null }))

export const openPlanDialog = (dialog: PlanDialog, returnFocus: HTMLElement | null) =>
  usePlanDialogs.setState({ dialog, returnFocus })

export const closePlanDialog = () => usePlanDialogs.setState({ dialog: null })

/** For a dialog's onCloseAutoFocus: puts focus back on the opener while it's still on the page, else on the Plan. */
export function returnPlanFocus(event: Event) {
  const target = usePlanDialogs.getState().returnFocus
  event.preventDefault()
  const fallback = document.querySelector<HTMLElement>("[data-plan-main]")
  ;(target?.isConnected ? target : fallback)?.focus()
}
