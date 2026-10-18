import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { ySyncPluginKey, yUndoPluginKey } from "@tiptap/y-tiptap"

/*
 * After an undo or redo, y-tiptap keeps the selection from before the undone edit, meaning to restore it with that
 * change. Yjs only reports the undo once it's applied, though, so the selection waits for the scene's next change
 * instead. The writer's own next change replaces it harmlessly, but a change from outside the editor (find's Replace
 * all, a version restored, another tab) would put the selection back where it was before the undone edit. This drops
 * it once the undo is over, so those changes leave the selection where the writer has it.
 */

interface UndoManagerEvents {
  on(name: "stack-item-popped", listener: () => void): void
  off(name: "stack-item-popped", listener: () => void): void
}

const undoSelectionKey = new PluginKey("undoSelection")

export const UndoSelection = Extension.create({
  name: "undoSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: undoSelectionKey,
        view(view) {
          const undoManager: UndoManagerEvents | undefined = yUndoPluginKey.getState(view.state)?.undoManager
          if (!undoManager) return {}
          // A microtask, so this runs after y-tiptap's own listener, whichever was added first.
          const popped = () =>
            queueMicrotask(() => {
              const binding = ySyncPluginKey.getState(view.state)?.binding
              if (binding) binding.beforeTransactionSelection = null
            })
          undoManager.on("stack-item-popped", popped)
          return { destroy: () => undoManager.off("stack-item-popped", popped) }
        },
      }),
    ]
  },
})
