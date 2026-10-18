import { useCallback, useState } from "react"

/** An element's content width, kept current as it resizes. Give the returned ref to the element; 0 until measured. */
export function useElementWidth<T extends HTMLElement>(): [(element: T | null) => () => void, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((element: T | null) => {
    if (!element) return () => {}
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
