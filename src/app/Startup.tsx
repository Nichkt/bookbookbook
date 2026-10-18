import { Button } from "@/components/ui/button"
import { reloadApp, usePwa } from "./pwa"

export function StartupSplash() {
  return (
    <div className="grid min-h-svh place-items-center bg-background px-6" role="status">
      <p className="animate-pulse font-heading text-lg text-muted-foreground">Opening your library…</p>
    </div>
  )
}

/** Shown when the local database can't open. Everything lives in browser storage, so nothing works without it. */
export function StartupError({ error }: { error: unknown }) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  // A new version may well fix it.
  const updateReady = usePwa((state) => state.updateReady)
  return (
    <div className="grid min-h-svh place-items-center bg-background px-6 py-10">
      <section role="alert" className="w-full max-w-md space-y-4">
        <h1 className="font-heading text-2xl font-semibold">Your library couldn't open</h1>
        {window.isSecureContext ? (
          <>
            <p className="leading-relaxed text-ink-2">
              bookbookbook keeps your books in this browser's storage, and the browser wouldn't allow it. Usually
              that's because:
            </p>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-ink-2">
              <li>this is a private or incognito window,</li>
              <li>site storage is blocked in the browser's settings, or</li>
              <li>the browser is too old for the storage it needs.</li>
            </ul>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-ink-2">
              This page was opened from an address the browser doesn't consider secure, so it won't let the page use
              the storage your books live in. Open bookbookbook from an <strong>https://</strong> address instead.
            </p>
            {import.meta.env.DEV && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Testing on a phone? Either forward the dev server over USB so the phone opens{" "}
                <code>http://localhost:5173</code>, or add this address to the phone's{" "}
                <code className="break-all">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>. Steps:{" "}
                <code>docs/ime-smoke-test.md</code>.
              </p>
            )}
          </>
        )}
        <details className="rounded-md border bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">Technical details</summary>
          <pre className="mt-2 font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">{detail}</pre>
        </details>
        <Button onClick={reloadApp}>{updateReady ? "Update and try again" : "Try again"}</Button>
      </section>
    </div>
  )
}
