import { useEditorState, type Editor } from "@tiptap/react"
import { activeEditor } from "@/editor/activeEditor"

/* Formatting from the Write screen's toolbars (DESIGN.md §8): the one at the top and the one above the keyboard. */

export interface FormatState {
  bold: boolean
  italic: boolean
  quote: boolean
  centered: boolean
}

const NO_FORMAT: FormatState = { bold: false, italic: false, quote: false, centered: false }

export function useFormatState(editor: Editor | null): FormatState {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }): FormatState =>
      !current || current.isDestroyed
        ? NO_FORMAT
        : {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            quote: current.isActive("blockquote"),
            centered: current.isActive({ textAlign: "center" }),
          },
  })
  return state ?? NO_FORMAT
}

/**
 * Runs a command on the scene the writer is in, focusing it first: after a toolbar button, the writer carries on
 * typing.
 */
export const command = (run: (editor: Editor) => void) => {
  const editor = activeEditor()?.editor
  if (editor && !editor.isDestroyed) run(editor)
}

export const toggleBold = (editor: Editor) => editor.chain().focus().toggleBold().run()
export const toggleItalic = (editor: Editor) => editor.chain().focus().toggleItalic().run()
export const toggleQuote = (editor: Editor) => editor.chain().focus().toggleBlockquote().run()
export const toggleCenter = (editor: Editor) => editor.chain().focus().toggleTextAlign("center").run()
export const sceneBreak = (editor: Editor) => editor.chain().focus().setHorizontalRule().run()
