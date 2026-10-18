import { StickyNotePlusIcon } from "lucide-react"
import { useLocation, useNavigate } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { refocus } from "@/features/help/helpStore"
import { NoteComposer } from "./NoteComposer"
import { closeQuickNote, openQuickNote, useQuickNote } from "./quickNoteStore"

/** The header's Quick note, in a book (DESIGN.md §4, "quick-capture"). */
export function QuickNoteButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="quick-note"
      data-quick-note-open=""
      title="Catch an idea for the Inbox"
      // Leaves focus where it was, in the text say, for the dialog to hand back once it closes.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const active = document.activeElement
        openQuickNote(active instanceof HTMLElement && active !== document.body ? active : event.currentTarget)
      }}
    >
      <StickyNotePlusIcon aria-hidden="true" />
      <span className="sr-only xl:not-sr-only">Quick note</span>
    </Button>
  )
}

/** Adds a note to the book's Inbox without leaving the page. */
export function QuickNoteDialog({ bookId }: { bookId: string }) {
  const open = useQuickNote((state) => state.open)
  const session = useQuickNote((state) => state.session)
  const returnFocus = useQuickNote((state) => state.returnFocus)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const inboxPath = `/b/${bookId}/inbox`
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeQuickNote()}>
      <DialogContent
        className="sm:max-w-lg"
        // With no trigger to go back to, Radix would leave focus nowhere.
        onCloseAutoFocus={(event) => refocus(event, returnFocus)}
        data-quick-note=""
      >
        <DialogHeader>
          <DialogTitle>Quick note</DialogTitle>
          <DialogDescription>
            It goes to this book's Inbox, to sort later. Close this and it's still here when you come back.
          </DialogDescription>
        </DialogHeader>
        <NoteComposer
          key={session}
          bookId={bookId}
          targetId="quick-note"
          label="Quick note"
          submitLabel="Save to Inbox"
          autoFocus
          cancel={
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
          }
          onAdded={() => {
            closeQuickNote()
            toast(
              "Saved to the Inbox.",
              pathname === inboxPath
                ? undefined
                : {
                    action: {
                      label: "Show",
                      onClick: () => {
                        // As offerUndo does: let Sonner hand focus back now, not after the Inbox takes it.
                        const active = document.activeElement
                        if (active instanceof HTMLElement && active.closest("[data-sonner-toaster]")) active.blur()
                        navigate(inboxPath)
                      },
                    },
                  },
            )
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
