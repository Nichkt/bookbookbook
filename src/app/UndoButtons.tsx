import { Redo2Icon, Undo2Icon } from "lucide-react"
import type { MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { redo, undo, useUndoLabels } from "@/undo/undoHistory"
import { REDO_ARIA, REDO_KEYS, UNDO_KEYS } from "./undoShortcuts"

/** In a scene's text, the caret stays put, to go on writing. A field loses focus as usual, which saves its typing. */
function keepTextFocus(event: MouseEvent) {
  const active = document.activeElement
  if (active instanceof HTMLElement && active.isContentEditable) event.preventDefault()
}

/** The header's Undo and Redo, for the book's latest edit, whichever page it was made on. */
export function UndoButtons() {
  const undoLabel = useUndoLabels((state) => state.undo)
  const redoLabel = useUndoLabels((state) => state.redo)
  return (
    <div className="flex items-center" data-tour="undo">
      {/* aria-disabled rather than disabled, so focus stays on the button once there's nothing left. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-disabled={!undoLabel}
        aria-keyshortcuts={ariaShortcut(UNDO_KEYS)}
        title={undoLabel ? `Undo: ${undoLabel} · ${shortcutLabel(UNDO_KEYS)}` : "Nothing to undo"}
        className="aria-disabled:opacity-50"
        onMouseDown={keepTextFocus}
        onClick={() => void undo()}
      >
        <Undo2Icon aria-hidden="true" />
        <span className="sr-only">Undo</span>
      </Button>
      {/* Phones have Redo in Search, for room. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-disabled={!redoLabel}
        aria-keyshortcuts={REDO_ARIA}
        title={redoLabel ? `Redo: ${redoLabel} · ${shortcutLabel(REDO_KEYS)}` : "Nothing to redo"}
        className="hidden aria-disabled:opacity-50 sm:inline-flex"
        onMouseDown={keepTextFocus}
        onClick={() => void redo()}
      >
        <Redo2Icon aria-hidden="true" />
        <span className="sr-only">Redo</span>
      </Button>
    </div>
  )
}
