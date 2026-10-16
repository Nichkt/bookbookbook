import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { reportError } from "@/app/feedback"

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
 * field shows the stored value again.
 */
export function useDraft(value: string, save: (next: string) => Promise<unknown> | void, delay = 400): Draft {
  const [local, setLocal] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    if (!focused) setLocal(null)
  }

  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef({ value, save })
  useLayoutEffect(() => {
    latest.current = { value, save }
  })

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const text = pending.current
    pending.current = null
    if (text === null || text === latest.current.value) return
    try {
      await latest.current.save(text)
    } catch (error) {
      reportError("save", error)
    }
  }, [])

  const onChange = useCallback(
    (next: string) => {
      setLocal(next)
      pending.current = next
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [delay, flush],
  )

  useEffect(
    () => () => {
      void flush()
    },
    [flush],
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
      setLocal(null)
    }, []),
  }
}
