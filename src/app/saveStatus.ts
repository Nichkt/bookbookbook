import { create } from "zustand"
import { beforeClosing, desktop } from "./desktop"

/*
 * Whether the writer's work is saved (DESIGN.md §12). Everything saves by itself as it's made, so this only says that
 * it has, or that it hasn't. A field's typing waits for a pause before it's written (useDraft), and a scene's text is
 * written as it's typed (SceneDocProvider): either counts as saving until it's written.
 */

export interface SaveState {
  /** Writes under way. */
  writing: number
  /** Fields with typing that isn't written yet, including any whose save failed. */
  waiting: number
  /**
   * What hasn't saved: "edit" for a change that failed (until a write works again), "draft:…" for a field's typing,
   * "scene:…" for a scene's text.
   */
  failed: readonly string[]
  /** When a write last finished. */
  savedAt: number | null
}

export const useSaveState = create<SaveState>(() => ({ writing: 0, waiting: 0, failed: [], savedAt: null }))

const set = useSaveState.setState

export function writeStarted() {
  set((state) => ({ writing: state.writing + 1 }))
}

export function writeEnded(ok: boolean) {
  set((state) => ({
    writing: Math.max(0, state.writing - 1),
    // A write that fails leaves the work not saved, until one works again.
    ...(ok ? { savedAt: Date.now(), failed: without(state.failed, "edit") } : { failed: adding(state.failed, "edit") }),
  }))
}

const without = (keys: readonly string[], key: string) => (keys.includes(key) ? keys.filter((k) => k !== key) : keys)
const adding = (keys: readonly string[], key: string) => (keys.includes(key) ? keys : [...keys, key])

export function markFailed(key: string) {
  set((state) => ({ failed: adding(state.failed, key) }))
}

export function markSaved(key: string) {
  set((state) => (state.failed.includes(key) ? { failed: without(state.failed, key) } : state))
}

// ── Fields' typing ──────────────────────────────────────────────────────────

const drafts = new Map<string, { flush: () => Promise<void>; failed: boolean }>()

const countDrafts = () => set({ waiting: drafts.size })

/** A field has typing that isn't written yet, which `flush` writes. */
export function draftWaiting(id: string, flush: () => Promise<void>) {
  drafts.set(id, { flush, failed: drafts.get(id)?.failed ?? false })
  countDrafts()
}

/** The field's typing is written, or there was nothing to write after all. */
export function draftSaved(id: string) {
  if (!drafts.delete(id)) return
  markSaved(`draft:${id}`)
  countDrafts()
}

/** Writing the field's typing failed. It's kept, for `flush` to try again. */
export function draftFailed(id: string, flush: () => Promise<void>) {
  drafts.set(id, { flush, failed: true })
  markFailed(`draft:${id}`)
  countDrafts()
}

/** Writes every field's waiting typing now: before Undo, say, and as the app closes. */
export async function flushDrafts(): Promise<void> {
  await Promise.all([...drafts.values()].map((draft) => draft.flush()))
}

// ── Leaving ─────────────────────────────────────────────────────────────────

/**
 * Writes fields' waiting typing as the app goes away: when the tab is hidden or closed, and as the desktop app's
 * window closes. A browser tab closed while something isn't written yet asks first. Scenes' text sees to its own
 * (sceneDocs.ts). Returns a function that stops it.
 */
export function saveOnLeaving(): () => void {
  const flushAll = () => flushDrafts().catch(() => undefined)
  const onHidden = () => {
    if (document.visibilityState === "hidden") void flushAll()
  }
  const onPageHide = () => void flushAll()
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    const { waiting, failed } = useSaveState.getState()
    if (waiting === 0 && failed.length === 0) return
    void flushAll()
    event.preventDefault()
    // Older browsers ask only when this is set.
    event.returnValue = ""
  }
  document.addEventListener("visibilitychange", onHidden)
  window.addEventListener("pagehide", onPageHide)
  // The desktop app's window waits for the work instead (src-tauri/src/lib.rs).
  if (!desktop) window.addEventListener("beforeunload", onBeforeUnload)
  const stopClosing = desktop ? beforeClosing(flushAll) : null
  return () => {
    document.removeEventListener("visibilitychange", onHidden)
    window.removeEventListener("pagehide", onPageHide)
    window.removeEventListener("beforeunload", onBeforeUnload)
    stopClosing?.()
  }
}
