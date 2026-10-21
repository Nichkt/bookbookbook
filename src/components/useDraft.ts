import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { reportError } from "@/app/feedback"
import { draftFailed, draftSaved, draftWaiting } from "@/app/saveStatus"
import { useTakenBack } from "@/undo/undoHistory"

export interface Draft {
  value: string
  onChange: (next: string) => void
  onFocus: () => void
  onBlur: () => void
  /** Saves now if there's an unsaved change; resolves once written. */
  flush: () => Promise<void>
  /** Drops unsaved text and shows the stored value again. */
  reset: () => void
}

/**
 * Local text for a field backed by a live query. Typing saves after a pause, and on blur or unmount. While the field
 * has focus, changes from elsewhere (another tab, a sync) wait, so the caret never jumps; once it loses focus the
 * field shows the stored value again. Typing not yet written counts as saving in the header (saveStatus.ts), and
 * typing that failed to save is kept, to try again.
 */
export function useDraft(value: string, save: (next: string) => Promise<unknown> | void, delay = 400): Draft {
  const id = useId()
  const [local, setLocal] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    if (!focused) setLocal(null)
  }

  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** The save under way, which a flush waits for: Undo flushes, and must find the edit already written. */
  const saving = useRef<Promise<void> | null>(null)
  const latest = useRef({ value, save })
  useLayoutEffect(() => {
    latest.current = { value, save }
  })

  const flush = useCallback(
    async function flushDraft(): Promise<void> {
      clearTimeout(timer.current)
      while (saving.current) await saving.current
      const text = pending.current
      pending.current = null
      if (text === null || text === latest.current.value) {
        draftSaved(id)
        return
      }
      const run = (async () => {
        try {
          await latest.current.save(text)
          // Typing since then is still waiting.
          if (pending.current === null) draftSaved(id)
        } catch (error) {
          pending.current ??= text
          draftFailed(id, flushDraft)
          reportError("save", error)
        }
      })()
      saving.current = run
      try {
        await run
      } finally {
        if (saving.current === run) saving.current = null
      }
    },
    [id],
  )

  const onChange = useCallback(
    (next: string) => {
      setLocal(next)
      pending.current = next
      draftWaiting(id, flush)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [delay, flush, id],
  )

  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )

  // Undo may have put the stored text back under the field, with focus back in it: it shows that, unless there's
  // typing waiting to save.
  useEffect(
    () =>
      useTakenBack.subscribe(() => {
        if (pending.current === null) setLocal(null)
      }),
    [],
  )

  return {
    value: local ?? value,
    onChange,
    onFocus: useCallback(() => setFocused(true), []),
    onBlur: useCallback(() => {
      setFocused(false)
      void flush()
    }, [flush]),
    flush,
    reset: useCallback(() => {
      clearTimeout(timer.current)
      pending.current = null
      draftSaved(id)
      setLocal(null)
    }, [id]),
  }
}
