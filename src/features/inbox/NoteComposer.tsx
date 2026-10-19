import { usePowerSync } from "@powersync/react"
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { announce, attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DictateButton } from "@/features/dictation/DictateButton"
import { DictationBadge } from "@/features/dictation/DictationBadge"
import { stopReadingAloud } from "@/features/write/readAloudStop"
import { isComposing } from "@/lib/keys"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { listeningEngine } from "@/speech/dictate"
import { isDictated, useTextareaTarget } from "@/speech/textareaTarget"
import { keepDraft, readDraft } from "./drafts"
import { addNote } from "./mutations"

interface NoteComposerProps {
  bookId: string
  /** Which box dictation types into: one id for each place a composer is shown. */
  targetId: string
  /** The box's name, for screen readers. */
  label: string
  submitLabel: string
  /** Once the note is in the Inbox. */
  onAdded: (noteId: string, text: string) => void
  autoFocus?: boolean
  /** Before the submit button, like a dialog's Cancel. */
  cancel?: ReactNode
  className?: string
}

/**
 * A note typed or dictated into the Inbox (DESIGN.md §10): the Inbox's own box, and Quick note's. A note with any
 * dictation in it is saved as dictated, with the engine that heard it. With a mouse, Enter adds it. A note not yet
 * added is still there when the box next opens.
 */
export function NoteComposer({
  bookId,
  targetId,
  label,
  submitLabel,
  onAdded,
  autoFocus,
  cancel,
  className,
}: NoteComposerProps) {
  const db = usePowerSync()
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const target = useTextareaTarget(targetId, "your note", box, { moments: true })
  // What was left unsaved here last time, as when Quick note was closed with a note half written.
  const [initial] = useState(() => readDraft(bookId, targetId))
  const [text, setText] = useState(initial.text)
  // A ref, not state, so a second press before the next render still sees the first.
  const busy = useRef(false)
  const heardBy = useRef(initial.heardBy)
  const enterAdds = useMediaQuery("(pointer: fine)")

  useEffect(() => {
    keepDraft(bookId, targetId, { text, heardBy: heardBy.current })
  }, [bookId, targetId, text])

  useEffect(() => {
    const element = box.current
    if (autoFocus && element && document.activeElement === element) {
      element.setSelectionRange(element.value.length, element.value.length)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, to carry on from the end of a draft

  const save = async () => {
    if (busy.current) return
    const saving = text
    const trimmed = saving.trim()
    if (!trimmed) {
      announce("Write or dictate a note first.")
      box.current?.focus()
      return
    }
    busy.current = true
    const engine = heardBy.current
    const noteId = await attempt(
      "add note",
      addNote(db, { bookId, text: trimmed, source: engine ? "voice-live" : "typed", sttEngine: engine }),
    )
    busy.current = false
    if (!noteId) return
    heardBy.current = null
    // Anything dictated while it saved stays, to start the next note.
    setText((current) => (current.startsWith(saving) ? current.slice(saving.length).trimStart() : current))
    // Ready for the next one, as after sending a message. A touch screen keeps its keyboard out of the way.
    if (enterAdds) box.current?.focus()
    onAdded(noteId, trimmed)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || isComposing(event.nativeEvent)) return
    const shortcut = event.ctrlKey || event.metaKey
    if (!shortcut && (!enterAdds || event.shiftKey || event.altKey)) return
    event.preventDefault()
    void save()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className={cn("@container grid gap-2", className)}
      data-note-composer={targetId}
    >
      <Textarea
        ref={box}
        aria-label={label}
        aria-describedby={enterAdds ? `${id}-hint` : undefined}
        autoFocus={autoFocus}
        rows={3}
        placeholder="An idea, a line of dialogue, a name to remember…"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          if (!next.trim()) heardBy.current = null
          else if (isDictated(event.nativeEvent)) heardBy.current = listeningEngine() ?? heardBy.current
          setText(next)
        }}
        onKeyDown={onKeyDown}
        className="max-h-[50vh] min-h-20 bg-background"
        data-note-text={targetId}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <DictateButton target={target} onStart={stopReadingAloud} />
        <DictationBadge />
        <div className="ml-auto flex items-center gap-3">
          {enterAdds && (
            // Only where it fits on the row, so the buttons don't wrap: not in Quick note's narrower dialog.
            <p id={`${id}-hint`} className="hidden text-xs text-muted-foreground @xl:block">
              Enter adds it · Shift+Enter for a new line
            </p>
          )}
          {cancel}
          {/* Never disabled, which would drop focus from it while it saves: save() ignores a second press. */}
          <Button type="submit" size="sm" data-note-submit={targetId}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
