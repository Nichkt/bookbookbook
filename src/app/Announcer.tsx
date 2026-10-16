import { useAnnouncer } from "./feedback"

/** The polite live region behind `announce()`. Mounted once, in the app shell. */
export function Announcer() {
  const { message, count } = useAnnouncer()
  return (
    <div role="status" aria-live="polite" className="sr-only">
      <span key={count}>{message}</span>
    </div>
  )
}
