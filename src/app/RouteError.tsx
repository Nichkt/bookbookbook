import { isRouteErrorResponse, Link, useRouteError } from "react-router"
import { Button } from "@/components/ui/button"
import { reloadApp, usePwa } from "./pwa"

/** Replaces React Router's developer error page. Edits are saved as they're typed, so a reload loses nothing. */
export function RouteError() {
  const error = useRouteError()
  // A new version may well fix it.
  const updateReady = usePwa((state) => state.updateReady)
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error)
  return (
    <section role="alert" className="mx-auto w-full max-w-md space-y-4 px-6 py-16">
      <h1 className="font-heading text-2xl font-semibold">Something went wrong on this screen</h1>
      <p className="leading-relaxed text-ink-2">Your writing is saved as you type. Reloading usually fixes this.</p>
      <details className="rounded-md border bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-medium">Technical details</summary>
        <pre className="mt-2 font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">{detail}</pre>
      </details>
      <div className="flex gap-2">
        <Button onClick={reloadApp}>{updateReady ? "Update and reload" : "Reload"}</Button>
        <Button variant="outline" asChild>
          <Link to="/">Back to my book</Link>
        </Button>
      </div>
    </section>
  )
}
