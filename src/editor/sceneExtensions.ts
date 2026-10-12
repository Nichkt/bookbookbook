import { Collaboration } from "@tiptap/extension-collaboration"
import { Typography } from "@tiptap/extension-typography"
import { Placeholder } from "@tiptap/extensions"
import { StarterKit } from "@tiptap/starter-kit"
import type * as Y from "yjs"
import { PROSE_FIELD } from "@/yjs/prose"
import { MentionHighlight } from "./extensions/MentionHighlight"
import type { MentionMatcher } from "./mentions"

/** Parts of the editor stack the IME lab can switch off one at a time. */
export interface SceneEditorFeatures {
  mentions: boolean
  guardComposition: boolean
  typography: boolean
}

export const DEFAULT_FEATURES: SceneEditorFeatures = { mentions: true, guardComposition: true, typography: true }

/** The scene editor stack (DESIGN.md §8), shared by the Write screen and the IME lab so both test the same thing. */
export function sceneExtensions(
  doc: Y.Doc,
  matcher: MentionMatcher,
  features: SceneEditorFeatures,
  placeholder: string,
) {
  return [
    StarterKit.configure({
      // Yjs owns undo (Collaboration adds y-tiptap's undo manager), so ProseMirror's history stays off.
      undoRedo: false,
      // Fiction has no use for code or links yet. TrailingNode would insert a paragraph on open, and two tabs
      // opening the same scene would each add one.
      code: false,
      codeBlock: false,
      link: false,
      trailingNode: false,
      heading: { levels: [2, 3] },
    }),
    Collaboration.configure({ document: doc, field: PROSE_FIELD }),
    Placeholder.configure({ placeholder }),
    ...(features.typography
      ? [
          // Smart quotes, dashes and ellipses only: arrows, fractions and (c) symbols don't belong in prose.
          Typography.configure({
            leftArrow: false,
            rightArrow: false,
            copyright: false,
            trademark: false,
            servicemark: false,
            registeredTrademark: false,
            oneHalf: false,
            oneQuarter: false,
            threeQuarters: false,
            plusMinus: false,
            notEqual: false,
            laquo: false,
            raquo: false,
            multiplication: false,
            superscriptTwo: false,
            superscriptThree: false,
          }),
        ]
      : []),
    ...(features.mentions
      ? [MentionHighlight.configure({ matcher, guardComposition: features.guardComposition })]
      : []),
  ]
}
