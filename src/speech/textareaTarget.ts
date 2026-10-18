import { useEffect, useMemo, type RefObject } from "react"
import { announce } from "@/app/feedback"
import { plainText } from "./commands"
import { cancelDictation, type DictationTarget } from "./dictation"

interface Typed {
  start: number
  text: string
}

/** The input event dictation sends, so a box's onChange can tell dictated words from typed ones. */
class DictatedInput extends Event {
  constructor() {
    super("input", { bubbles: true })
  }
}

/** Whether a box's input event (`event.nativeEvent` in React) was dictation typing. */
export const isDictated = (event: Event) => event instanceof DictatedInput

/**
 * Dictation into a plain text box: at the caret while the writer's in the box, else at the end. Typing it the way
 * the browser would means the box's onChange sees it, as if typed.
 */
export function textareaTarget(
  id: string,
  label: string,
  box: { readonly current: HTMLTextAreaElement | null },
  options: { moments?: boolean } = {},
): DictationTarget {
  const history: Typed[] = []
  const scratch = (element: HTMLTextAreaElement) => {
    const last = history.pop()
    if (!last) return false
    const end = last.start + last.text.length
    if (element.value.slice(last.start, end) !== last.text) {
      history.length = 0
      announce("Couldn't scratch that: the note has changed since.")
      return false
    }
    element.setRangeText("", last.start, end, "end")
    return true
  }
  return {
    id,
    label,
    moments: options.moments,
    alive: () => box.current?.isConnected === true,
    insert(steps) {
      const element = box.current
      if (!element) return
      const inBox = document.activeElement === element
      let changed = false
      let index = 0
      for (; steps[index]?.kind === "scratch"; index++) changed = scratch(element) || changed
      const start = inBox ? element.selectionStart : element.value.length
      const end = inBox ? element.selectionEnd : start
      const text = plainText(element.value.slice(0, start), steps.slice(index))
      if (text) {
        element.setRangeText(text, start, end, "end")
        history.push({ start, text })
        changed = true
      }
      if (!changed) return
      element.dispatchEvent(new DictatedInput())
      if (!inBox) element.scrollTop = element.scrollHeight
    },
  }
}

/** A text box to dictate into, which stops dictation into it when it goes. */
export function useTextareaTarget(
  id: string,
  label: string,
  ref: RefObject<HTMLTextAreaElement | null>,
  options: { moments?: boolean } = {},
): DictationTarget {
  const { moments } = options
  const target = useMemo(() => textareaTarget(id, label, ref, { moments }), [id, label, ref, moments])
  useEffect(() => () => cancelDictation(id), [id])
  return target
}
