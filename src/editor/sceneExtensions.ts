import { Collaboration } from "@tiptap/extension-collaboration"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Focus, Placeholder } from "@tiptap/extensions"
import { StarterKit } from "@tiptap/starter-kit"
import type * as Y from "yjs"
import { PROSE_FIELD } from "@/yjs/prose"
import { EscapeKey } from "./extensions/EscapeKey"
import { FindHighlight } from "./extensions/FindHighlight"
import { MentionHighlight } from "./extensions/MentionHighlight"
import { ReadAloudHighlight } from "./extensions/ReadAloud"
import { Typewriter } from "./extensions/Typewriter"
import { UndoSelection } from "./extensions/UndoSelection"
import type { MentionMatcher } from "./mentions"

/** Parts of the editor stack the IME lab can switch off one at a time. */
export interface SceneEditorFeatures {
  mentions: boolean
  guardComposition: boolean
  typography: boolean
}

export const DEFAULT_FEATURES: SceneEditorFeatures = { mentions: true, guardComposition: true, typography: true }

/** Only "center" is stored; left is no attribute at all. Its shortcuts would otherwise pass Ctrl+Shift+R to the browser. */
const CenterAlign = TextAlign.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-e": () => this.editor.commands.toggleTextAlign("center"),
      "Mod-Shift-l": () => this.editor.commands.unsetTextAlign(),
    }
  },
})

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
    // Prose is left-aligned or centred (epigraphs, letters, signs). The horizontal rule from StarterKit is the
    // scene break.
    CenterAlign.configure({ types: ["heading", "paragraph"], alignments: ["center"] }),
    Collaboration.configure({ document: doc, field: PROSE_FIELD }),
    UndoSelection,
    Placeholder.configure({ placeholder }),
    // Focus marks the blocks around the caret, which focus mode leaves undimmed (index.css). Typewriter keeps the
    // caret's line mid-window while typewriter scrolling is on. EscapeKey hands Esc to the page, to leave focus mode.
    Focus.configure({ className: "has-focus", mode: "all" }),
    Typewriter,
    EscapeKey,
    // Marks the sentence read aloud is speaking, and find and replace's matches.
    ReadAloudHighlight,
    FindHighlight,
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
