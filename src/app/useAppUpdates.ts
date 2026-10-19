import { type MouseEvent, useEffect } from "react"
import { toast } from "sonner"
import { flushSceneDocs } from "@/editor/sceneDocs"
import { openBookDialog, useBookDialogs } from "@/features/books/dialogStore"
import { reloadApp, saveBeforeReload, usePwa } from "./pwa"
import { installUpdate, useUpdates } from "./updates"

/**
 * Says when the app first works offline and when a new version is ready, and saves the writing before it starts. In
 * the desktop app, a new version is ready once it has downloaded with Updates closed (updates.ts).
 */
export function useAppUpdates() {
  const offlineReady = usePwa((state) => state.offlineReady)
  const updateReady = usePwa((state) => state.updateReady)
  const downloaded = useUpdates((state) => (state.step === "ready" ? state.version : null))
  useEffect(() => saveBeforeReload(flushSceneDocs), [])

  useEffect(() => {
    if (!offlineReady) return
    toast("Ready to work offline", {
      id: "offline-ready",
      description: "bookbookbook now opens without an internet connection.",
    })
  }, [offlineReady])

  useEffect(() => {
    if (!updateReady) return
    toast("A new version of bookbookbook is ready", {
      id: "update-ready",
      description: "Reload to start using it, or it starts the next time you open bookbookbook.",
      duration: Infinity,
      action: { label: "Reload", onClick: reloadApp },
      cancel: { label: "Later", onClick: () => undefined },
    })
  }, [updateReady])

  useEffect(() => {
    if (!downloaded) return
    toast(`bookbookbook ${downloaded} is ready to install`, {
      id: DOWNLOADED_TOAST,
      description: "Installing saves your work and closes bookbookbook for a moment, then it opens again.",
      duration: Infinity,
      action: { label: "Install now", onClick: installFromToast },
      cancel: { label: "Later", onClick: () => undefined },
    })
    // Gone once it's installing, or Updates offers it instead.
    return () => void toast.dismiss(DOWNLOADED_TOAST)
  }, [downloaded])
}

const DOWNLOADED_TOAST = "desktop-update-ready"

/** Opens Updates to install, where it says how it's going. While another dialog is busy, the toast stays. */
function installFromToast(event: MouseEvent) {
  if (useBookDialogs.getState().busy) return event.preventDefault()
  openBookDialog("updates", null)
  void installUpdate()
}
