import { useEffect } from "react"
import { toast } from "sonner"
import { flushSceneDocs } from "@/editor/sceneDocs"
import { reloadApp, saveBeforeReload, usePwa } from "./pwa"

/** Says when the app first works offline and when a new version is ready, and saves the writing before it starts. */
export function useAppUpdates() {
  const offlineReady = usePwa((state) => state.offlineReady)
  const updateReady = usePwa((state) => state.updateReady)
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
}
