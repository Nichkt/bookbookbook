import { PowerSyncContext } from "@powersync/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"
import { StartupError, StartupSplash } from "@/app/Startup"
import { db, openDatabase } from "@/db/powersync"
import "./index.css"

const root = createRoot(document.getElementById("root")!)
root.render(<StartupSplash />)

async function start() {
  // Fetch the app while the database opens.
  const app = import("@/app/router")
  // If the database fails first, nothing awaits this; `await app` below still throws.
  app.catch(() => undefined)
  try {
    await openDatabase()
    if (import.meta.env.DEV) (await import("@/app/devHooks")).installDevHooks()
    const { router } = await app
    root.render(
      <StrictMode>
        <PowerSyncContext.Provider value={db}>
          <RouterProvider router={router} />
        </PowerSyncContext.Provider>
      </StrictMode>,
    )
  } catch (error) {
    console.error("[startup]", error)
    root.render(<StartupError error={error} />)
  }
}

void start()
