import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { canSplit } from "@tiptap/pm/transform"
import type { EditorView } from "@tiptap/pm/view"
import { leafText } from "@/ai/docText"
import { spaceAfter } from "@/ai/insert"
import { announce } from "@/app/feedback"
import type { Db } from "@/db/tx"
import { activeEditor, useEditors } from "@/editor/activeEditor"
import { IS_MAC } from "@/lib/keys"
import { spaced, type Step } from "@/speech/commands"
import { toggleDictation } from "@/speech/dictate"
import { cancelDictation, isDictatingInto, stopDictation, type DictationTarget } from "@/speech/dictation"
import { readSpeechSettings } from "@/speech/settings"
import { stopReading } from "./readAloud"

/*
 * Dictation into the writer's text (DESIGN.md §10): typed at the caret of the scene they're in, as if they'd typed
 * it. Before they've clicked into the text, it carries on from the end of the scene filling the window.
 */

/** What dictation needs of an editor, as a TipTap Editor has it. */
export interface ProseEditor {
  readonly state: EditorState
  readonly view: Pick<EditorView, "dispatch">
  readonly isDestroyed: boolean
  readonly isEditable: boolean
}

/** Where dictation goes: an editor, at its caret or at the end of its text. */
export interface ProsePlace {
  editor: ProseEditor
  atEnd: boolean
}

const textBefore = ($pos: ResolvedPos) =>
  $pos.parent.isTextblock ? $pos.parent.textBetween(0, $pos.parentOffset, undefined, leafText) : ""

const textAfter = ($pos: ResolvedPos) =>
  $pos.parent.isTextblock
    ? $pos.parent.textBetween($pos.parentOffset, $pos.parent.content.size, undefined, leafText)
    : ""

export interface Dictated {
  tr: Transaction
  /** Where the transaction's doc has the dictated text: what "scratch that" takes back. */
  from: number
  to: number
}

/**
 * Types a piece of dictation at the caret, in place of any selection, or at the end of the text: words spaced and
 * capitalized to follow on from what's before them, and breaks as Enter and Shift+Enter make them. Null when there's
 * nothing to type.
 */
export function dictationTransaction(state: EditorState, steps: readonly Step[], atEnd = false): Dictated | null {
  const tr = state.tr
  if (atEnd) {
    const end = Selection.findFrom(tr.doc.resolve(tr.doc.content.size), -1, true)
    if (end) tr.setSelection(end)
  } else if (!tr.selection.empty) tr.deleteSelection()
  const from = tr.selection.from
  let typed = false
  for (const step of steps) {
    if (step.kind === "words" || step.kind === "mark") {
      const text = spaced(textBefore(tr.selection.$from), step)
      if (!text) continue
      tr.insertText(text)
      typed = true
    } else if (step.kind === "break") {
      // As after Enter, the words go on in the bold or italic of those before.
      const marks = tr.storedMarks ?? tr.selection.$from.marks()
      if (!step.paragraph) tr.replaceSelectionWith(state.schema.nodes.hardBreak.create(), false)
      else if (canSplit(tr.doc, tr.selection.from)) tr.split(tr.selection.from)
      else continue
      tr.ensureMarks(marks)
      typed = true
    }
  }
  if (!typed) return null
  // Dictated before other words, it gets a space between, with the caret before it for what's said next.
  const $end = tr.selection.$from
  let to = $end.pos
  if (spaceAfter(textBefore($end), textAfter($end))) {
    tr.insertText(" ", $end.pos)
    tr.setSelection(TextSelection.create(tr.doc, $end.pos))
    to++
  }
  return { tr: tr.scrollIntoView(), from, to }
}

interface Piece {
  editor: ProseEditor
  from: number
  to: number
  /** The doc just after it went in: once the text has changed, it can't be taken back. */
  doc: ProseMirrorNode
}

/** How many pieces "scratch that" can take back, one at a time. */
const MAX_PIECES = 50

export interface ProseTarget extends DictationTarget {
  /** Forgets what's been dictated, so "scratch that" can't take it back. */
  forget(): void
}

/** Dictation into the text of whichever editor `place` finds as each piece settles. */
export function proseTarget(place: () => ProsePlace | null): ProseTarget {
  const pieces: Piece[] = []
  const scratch = () => {
    const last = pieces.pop()
    if (!last) return
    const { editor } = last
    if (editor.isDestroyed || !editor.state.doc.eq(last.doc)) {
      pieces.length = 0
      announce("Couldn't scratch that: the text has changed since.")
      return
    }
    editor.view.dispatch(editor.state.tr.delete(last.from, last.to).scrollIntoView())
  }
  return {
    id: "prose",
    label: "your scene",
    alive: () => place() !== null,
    insert(steps) {
      let index = 0
      for (; steps[index]?.kind === "scratch"; index++) scratch()
      const found = index < steps.length ? place() : null
      if (!found) return
      const { editor, atEnd } = found
      const dictated = dictationTransaction(editor.state, steps.slice(index), atEnd)
      if (!dictated) return
      editor.view.dispatch(dictated.tr)
      pieces.push({ editor, from: dictated.from, to: dictated.to, doc: editor.state.doc })
      if (pieces.length > MAX_PIECES) pieces.shift()
    },
    forget() {
      pieces.length = 0
    },
  }
}

/** The scene the writer is in, at its caret; before they've been in one, the scene filling the window, at its end. */
function writersPlace(): ProsePlace | null {
  const entry = activeEditor()
  if (!entry || entry.editor.isDestroyed || !entry.editor.isEditable) return null
  return { editor: entry.editor, atEnd: !useEditors.getState().focused }
}

/** The Write screen's text, for its Dictate buttons. */
export const PROSE_TARGET = proseTarget(writersPlace)

/** As the Write screen goes: dictation into it stops, and what was said can no longer be taken back. */
export function endProseDictation() {
  cancelDictation(PROSE_TARGET.id)
  PROSE_TARGET.forget()
}

/**
 * Dictate's shortcut (DESIGN.md §8 "Keyboard"). Chrome and Edge give Ctrl+Shift+M to their profile menu, but only
 * once the page has passed it up.
 */
export const DICTATE_KEYS = "Mod+Shift+M"

export const isDictateShortcut = (event: KeyboardEvent) =>
  (IS_MAC ? event.metaKey : event.ctrlKey) &&
  event.shiftKey &&
  !event.altKey &&
  (event.code === "KeyM" || event.key.toLowerCase() === "m")

/**
 * What the shortcut does, as Dictate in the toolbar would: stops dictation into the text, or starts it, stopping
 * Read aloud first, which the microphone would hear. Nothing while there's no text to dictate into.
 */
export async function dictateFromKeyboard(db: Db, returnFocus: HTMLElement | null) {
  if (isDictatingInto(PROSE_TARGET.id)) {
    stopDictation()
    return
  }
  if (!PROSE_TARGET.alive?.()) return
  const settings = await readSpeechSettings(db)
  stopReading()
  await toggleDictation(PROSE_TARGET, settings, returnFocus)
}
