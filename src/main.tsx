import { PowerSyncContext } from "@powersync/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"
import { listenForInstall } from "@/app/install"
import { registerServiceWorker } from "@/app/pwa"
import { preloadScreenAt, prefetchScreens } from "@/app/screens"
import { StartupError, StartupSplash } from "@/app/Startup"
import { db, openDatabase } from "@/db/powersync"
import "./index.css"

const root = createRoot(document.getElementById("root")!)
root.render(<StartupSplash />)

async function start() {
  // Before the database, so that a new version can still come should this one not start.
  void registerServiceWorker()
  listenForInstall()
  // Fetch the app while the database opens.
  const app = import("@/app/router")
  preloadScreenAt(location.pathname)
  // If the database fails first, nothing awaits this; `await app` below still throws.
  app.catch(() => undefined)
  try {
    await openDatabase()
    if (import.meta.env.DEV) (await import("@/app/devHooks")).installDevHooks()
    const { router } = await app
    // The splash stays up until the first screen's chunk is in, rather than giving way to a blank page.
    if (!router.state.initialized) {
      await new Promise<void>((resolve) => {
        const stop = router.subscribe((state) => {
          if (!state.initialized) return
          stop()
          resolve()
        })
      })
    }
    root.render(
      <StrictMode>
        <PowerSyncContext.Provider value={db}>
          <RouterProvider router={router} />
        </PowerSyncContext.Provider>
      </StrictMode>,
    )
    whenIdle(prefetchScreens)
  } catch (error) {
    console.error("[startup]", error)
    root.render(<StartupError error={error} />)
  }
}

function whenIdle(task: () => void) {
  if ("requestIdleCallback" in window) requestIdleCallback(task, { timeout: 3000 })
  else setTimeout(task, 1500)
}

void start()
