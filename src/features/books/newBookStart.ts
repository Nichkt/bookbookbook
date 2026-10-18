import { scaffoldStructure, type StoryStructure } from "@/features/plan/structures"

/** New book's "Start with" choices: one blank chapter, the step-by-step plan, or a chapter per structure moment. */
export const START_BLANK = "blank"
export const START_WIZARD = "wizard"
export const startValue = (structure: StoryStructure) => `structure:${structure.key}`

/** What starting from a structure gives the book, in a sentence or two. */
export function startAbout(structure: StoryStructure) {
  const { acts, hasActs } = scaffoldStructure(structure, null, 0)
  const chapters = structure.beats.length
  const shape = `${chapters} ${chapters === 1 ? "chapter" : "chapters"}${
    hasActs && acts.length > 1 ? ` in ${acts.length} acts` : ""
  }`
  return `${structure.summary} You get ${shape}, one for each of its moments, titled to match.`
}
