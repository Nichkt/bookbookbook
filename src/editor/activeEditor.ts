import type { Editor } from "@tiptap/react"
import { create } from "zustand"

/*
 * The scene editors on the page, so one toolbar can work on whichever the writer is in (DESIGN.md §8). Before any
 * has had focus, that's the first one on the page.
 */

export interface MountedEditor {
  editor: Editor
  sceneId: string
}

interface EditorsState {
  mounted: MountedEditor[]
  /** The editor that last had focus, while it's still on the page. */
  focused: MountedEditor | null
}

export const useEditors = create<EditorsState>(() => ({ mounted: [], focused: null }))

export function registerEditor(editor: Editor, sceneId: string) {
  useEditors.setState((state) => ({ mounted: [...state.mounted, { editor, sceneId }] }))
}

export function unregisterEditor(editor: Editor) {
  useEditors.setState((state) => ({
    mounted: state.mounted.filter((entry) => entry.editor !== editor),
    focused: state.focused?.editor === editor ? null : state.focused,
  }))
}

export function editorFocused(editor: Editor) {
  const entry = useEditors.getState().mounted.find((candidate) => candidate.editor === editor)
  if (entry && useEditors.getState().focused !== entry) useEditors.setState({ focused: entry })
}

function firstOnPage(mounted: MountedEditor[]): MountedEditor | null {
  let first: MountedEditor | null = null
  for (const entry of mounted) {
    if (entry.editor.isDestroyed) continue
    if (!first || first.editor.view.dom.compareDocumentPosition(entry.editor.view.dom) & Node.DOCUMENT_POSITION_PRECEDING) {
      first = entry
    }
  }
  return first
}

const activeIn = (state: EditorsState) => state.focused ?? firstOnPage(state.mounted)

/** The editor the toolbar shows the formatting of. */
export const useActiveEditor = (): MountedEditor | null => useEditors(activeIn)

/**
 * The editor a toolbar button or shortcut works on, worked out as it runs: the one that last had focus, else the
 * one filling most of the window below the toolbar (marked `data-write-toolbar`), as when the manuscript has been
 * scrolled without clicking into the text.
 */
export function activeEditor(): MountedEditor | null {
  const { focused, mounted } = useEditors.getState()
  return focused ?? mostInView(mounted) ?? firstOnPage(mounted)
}

function mostInView(mounted: MountedEditor[]): MountedEditor | null {
  const top = document.querySelector("[data-write-toolbar]")?.getBoundingClientRect().bottom ?? 0
  let best: MountedEditor | null = null
  let bestShown = 0
  for (const entry of mounted) {
    if (entry.editor.isDestroyed) continue
    const rect = entry.editor.view.dom.getBoundingClientRect()
    const shown = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, top)
    if (shown > bestShown) {
      best = entry
      bestShown = shown
    }
  }
  return best
}

/** The mounted editor of a scene, if it has one. */
export const editorOf = (sceneId: string): MountedEditor | undefined =>
  useEditors.getState().mounted.find((entry) => entry.sceneId === sceneId && !entry.editor.isDestroyed)

/** The editor `element` is in, if it's in one: where focus goes back to, caret and all, after a dialog. */
export function editorContaining(element: Element | null): Editor | null {
  if (!element) return null
  const found = useEditors
    .getState()
    .mounted.find(({ editor }) => !editor.isDestroyed && editor.view.dom.contains(element))
  return found?.editor ?? null
}

/**
 * Puts focus back on `element`, as a dialog closes. In a scene's text that goes through the editor, so the caret is
 * back where it was: plain focus() would put it at the start, once the dialog's field has had the selection.
 */
export function focusBack(element: HTMLElement) {
  const editor = editorContaining(element)
  if (editor) editor.view.focus()
  else element.focus()
}

/**
 * Runs `work` with a scene's editor once it's on the page, e.g. after navigating to the scene. Returns a cancel
 * function for effect cleanups.
 *
 * An editor that arrives gets a moment to settle first: in development, StrictMode unmounts and remounts it at once,
 * taking it off the page and rebuilding its text in between.
 */
export function whenEditor(sceneId: string, work: (entry: MountedEditor) => void): () => void {
  const found = editorOf(sceneId)
  if (found) {
    work(found)
    return () => undefined
  }
  let done = false
  let settling = false
  const cancel = () => {
    done = true
    unsubscribe()
  }
  const unsubscribe = useEditors.subscribe(() => {
    if (settling || !editorOf(sceneId)) return
    settling = true
    queueMicrotask(() => {
      settling = false
      const entry = editorOf(sceneId)
      if (done || !entry) return
      cancel()
      work(entry)
    })
  })
  return cancel
}
