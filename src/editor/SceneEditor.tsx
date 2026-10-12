import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { useEffect } from "react"
import { cn } from "@/lib/utils"
import type { SceneDocProvider } from "@/yjs/SceneDocProvider"
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
}: SceneEditorProps) {
  const editor = useEditor(
    {
      extensions: sceneExtensions(provider.doc, matcher, features, placeholder),
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label,
          spellcheck: "true",
        },
      },
    },
    // A new matcher is pushed in below rather than rebuilding the editor.
    [provider, features.mentions, features.guardComposition, features.typography, placeholder, label],
  )

  useEffect(() => {
    if (features.mentions && !editor.isDestroyed) editor.commands.setMentionMatcher(matcher)
  }, [editor, matcher, features.mentions])

  useEffect(() => {
    onEditor?.(editor)
  }, [editor, onEditor])

  return <EditorContent editor={editor} className={cn("prose-page mx-auto", className)} />
}
