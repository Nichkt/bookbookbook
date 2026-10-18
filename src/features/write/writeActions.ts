import { activeEditor } from "@/editor/activeEditor"
import { centerCaret } from "@/editor/extensions/Typewriter"
import type { Plan } from "@/features/plan/planData"
import { byData } from "@/lib/focus"
import { AI_PANEL_HEADING } from "./ai/aiState"
import { CODEX_PANEL_HEADING } from "./codexPanelData"
import { FIND_INPUT } from "./findActions"
import { openHistory } from "./history"
import { sceneNameIn, type PanelPage } from "./writeContext"

/* What the Write screen's toolbar, its ⋯ menus and the command palette do alike. */

/** Where focus goes as a page of the side panel opens: its heading, or for Find and replace its search. */
export function panelHeading(page: PanelPage, chapterId: string) {
  if (page === "plan") return byData("drawer-heading", chapterId)
  if (page === "ai") return AI_PANEL_HEADING
  return page === "codex" ? CODEX_PANEL_HEADING : FIND_INPUT
}

/** Turning typewriter scrolling on puts the writer back in the text, with the caret's line brought to the middle. */
export function switchTypewriter(on: boolean, setTypewriter: (on: boolean) => void) {
  setTypewriter(on)
  const editor = activeEditor()?.editor
  if (!on || !editor || editor.isDestroyed) return
  editor.commands.focus(null, { scrollIntoView: false })
  // Once the room below the last line is there.
  requestAnimationFrame(() => centerCaret(editor.view))
}

/** Opens the History dialog of the scene the writer is in. */
export function showHistory(plan: Plan, returnFocus: HTMLElement | null) {
  const target = activeEditor()
  if (target) openHistory(target.sceneId, sceneNameIn(plan, target.sceneId), returnFocus)
}
