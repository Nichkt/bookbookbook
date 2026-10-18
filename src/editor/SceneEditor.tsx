import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { useEffect, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { SceneDocProvider } from "@/yjs/SceneDocProvider"
import { editorFocused, registerEditor, unregisterEditor } from "./activeEditor"
import type { MentionMatcher } from "./mentions"
import { DEFAULT_FEATURES, sceneExtensions, type SceneEditorFeatures } from "./sceneExtensions"

interface SceneEditorProps {
  provider: SceneDocProvider
  matcher: MentionMatcher
  /** Accessible name of the text box, e.g. the scene title. */
  label: string
  features?: SceneEditorFeatures
  placeholder?: string
  className?: string
  /** Hands the editor out once it exists, e.g. to the IME lab's event log. */
  onEditor?: (editor: Editor) => void
  /** What goes with the editor, like a menu over its selection. */
  children?: (editor: Editor) => ReactNode
}

/** One scene's prose, bound to its Y.Doc. Mount it only once the provider has loaded (`useSceneDoc`). */
export function SceneEditor({
  provider,
  matcher,
  label,
  features = DEFAULT_FEATURES,
  placeholder = "Start writing…",
  className,
  onEditor,
  children,
}: SceneEditorProps) {
  const editor = useEditor(
    {
      extensions: sceneExtensions(provider.doc, matcher, features, placeholder),
      editorProps: { attributes: editorAttributes(label) },
    },
    // A new matcher or label is pushed in below rather than rebuilding the editor, which would drop the caret.
    [provider, features.mentions, features.guardComposition, features.typography, placeholder],
  )

  useEffect(() => {
    if (features.mentions && !editor.isDestroyed) editor.commands.setMentionMatcher(matcher)
  }, [editor, matcher, features.mentions])

  useEffect(() => {
    if (editor.isDestroyed || editor.view.dom.getAttribute("aria-label") === label) return
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: editorAttributes(label) } })
  }, [editor, label])

  useEffect(() => {
    registerEditor(editor, provider.sceneId)
    const onFocus = () => editorFocused(editor)
    editor.on("focus", onFocus)
    return () => {
      editor.off("focus", onFocus)
      unregisterEditor(editor)
    }
  }, [editor, provider])

  useEffect(() => {
    onEditor?.(editor)
  }, [editor, onEditor])

  return (
    <>
      <EditorContent editor={editor} className={cn("prose-page mx-auto", className)} />
      {children?.(editor)}
    </>
  )
}

const editorAttributes = (label: string) => ({
  role: "textbox",
  "aria-multiline": "true",
  "aria-label": label,
  spellcheck: "true",
})
