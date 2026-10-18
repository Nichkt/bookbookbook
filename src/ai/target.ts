import type { FieldValues, ToolDef } from "./tools"

/*
 * What a tool works on, said in a line under it in the AI panel (DESIGN.md §9 "Tools"), so the writer knows before
 * they run it: the caret, their selection, a subject, or the whole chapter.
 */

export interface TargetInfo {
  /** The scene the writer is in, named as in a sentence ("“Ferry wake”"); null without a scene's text on the page. */
  sceneName: string | null
  /** The words selected in it; 0 for none. */
  selectedWords: number
  /** The chapter, as in a sentence ("chapter 3"); null when there's none. */
  chapterName: string | null
}

const words = (count: number) => `${count.toLocaleString("en-US")} ${count === 1 ? "word" : "words"}`

/** "12%": how much of some text is AI-written and not yet made the writer's own; null when there's no text. */
export function aiShare(total: number, aiWords: number): string | null {
  if (total <= 0) return null
  const share = (Math.min(Math.max(0, aiWords), total) / total) * 100
  if (share > 0 && share < 1) return "under 1%"
  return `${Math.round(share)}%`
}

export function toolTarget(tool: ToolDef, fields: FieldValues, info: TargetInfo): string {
  const selected = info.selectedWords > 0
  switch (tool.input) {
    case "chapter":
      return `Reads all of ${info.chapterName ?? "the chapter"}.`
    case "selection":
      return selected ? `Works on the ${words(info.selectedWords)} you selected.` : "Select the text it should work on."
    case "subject": {
      const subject = fields.subject?.trim()
      if (subject) return `Describes “${subject}”.`
      return selected
        ? `Describes the ${words(info.selectedWords)} you selected.`
        : "Type what to describe, or select it in your text."
    }
    case "caret":
      if (tool.placement === "insert") {
        return info.sceneName ? `Writes at your cursor in ${info.sceneName}.` : "Click in your text where it should go."
      }
      if (tool.window.before === 0 && tool.window.after === 0) return "Reads the names in your World, to avoid them."
      return info.sceneName
        ? `Reads the text before your cursor in ${info.sceneName}.`
        : "Reads the chapter's plan and your World."
  }
}
