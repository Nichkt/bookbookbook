import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { closePlanDialog, openPlanDialog, returnPlanFocus, usePlanDialogs } from "./planDialogs"
import { PlanWizard } from "./PlanWizard"
import { StructuresDialog } from "./StructuresDialog"

const SCROLLING = "flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto sm:max-w-2xl"

/** Both hold work, so a stray click outside doesn't close them. */
const keepOpen = (event: Event) => event.preventDefault()

/** The Plan's dialogs, opened from the Structure menu, or by a new book planned step by step. */
export function PlanDialogHost() {
  const dialog = usePlanDialogs((state) => state.dialog)
  const location = useLocation()
  const navigate = useNavigate()

  // Leaving the Plan closes them, so they don't open again on the next book's.
  useEffect(() => closePlanDialog, [])

  // A new book planned step by step arrives with { wizard: true }. It's cleared so a reload doesn't reopen it.
  useEffect(() => {
    if ((location.state as { wizard?: unknown } | null)?.wizard !== true) return
    openPlanDialog("wizard", null)
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [location, navigate])

  return (
    <>
      <Dialog open={dialog === "structures"} onOpenChange={(open) => !open && closePlanDialog()}>
        <DialogContent
          className={SCROLLING}
          data-structures-dialog=""
          onInteractOutside={keepOpen}
          onCloseAutoFocus={returnPlanFocus}
        >
          <StructuresDialog />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "wizard"} onOpenChange={(open) => !open && closePlanDialog()}>
        <DialogContent
          className={SCROLLING}
          data-wizard-dialog=""
          onInteractOutside={keepOpen}
          onCloseAutoFocus={returnPlanFocus}
        >
          <PlanWizard />
        </DialogContent>
      </Dialog>
    </>
  )
}
