import { parseStringList } from "@/lib/json"

/*
 * How a book is told, set in Book settings for the AI tools (DESIGN.md §9 "Context assembly"). The book keeps a code,
 * as the sample book's "third_limited"; the settings show a plain label, and prompts say it the way a writer would.
 */

export interface StyleOption {
  value: string
  label: string
  /** As the prompt says it. */
  prompt: string
}

export const POV_OPTIONS: readonly StyleOption[] = [
  { value: "first", label: "First person (I walked)", prompt: "first person" },
  { value: "second", label: "Second person (you walked)", prompt: "second person" },
  {
    value: "third_limited",
    label: "Third person, close to one character (she walked)",
    prompt: "third person limited, close to one character at a time",
  },
  { value: "third_omniscient", label: "Third person, a narrator who knows all", prompt: "third person omniscient" },
  { value: "multiple", label: "It changes from chapter to chapter", prompt: "it changes between characters" },
]

export const TENSE_OPTIONS: readonly StyleOption[] = [
  { value: "past", label: "Past (she walked)", prompt: "past tense" },
  { value: "present", label: "Present (she walks)", prompt: "present tense" },
]

export const AUDIENCE_OPTIONS: readonly StyleOption[] = [
  { value: "adult", label: "Adults", prompt: "adult" },
  { value: "new_adult", label: "New adult (18 to 25)", prompt: "new adult (readers aged 18 to 25)" },
  { value: "young_adult", label: "Young adult (teens)", prompt: "young adult (teen readers)" },
  { value: "middle_grade", label: "Middle grade (8 to 12)", prompt: "middle grade (readers aged 8 to 12)" },
  { value: "children", label: "Children (under 8)", prompt: "children under 8" },
]

/** The Select's value for none chosen: Radix's items can't have an empty value. */
export const NOT_SET = "not_set"

/** A stored value as its Select shows it: NOT_SET for none, or for one it doesn't know (as from an import). */
export const styleChoice = (options: readonly StyleOption[], value: string | null | undefined) =>
  options.some((option) => option.value === value) ? value! : NOT_SET

/** A stored value as a prompt says it: an unknown one as written. */
export function stylePrompt(options: readonly StyleOption[], value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ""
  return options.find((option) => option.value === trimmed)?.prompt ?? trimmed
}

/** Passages written apart by blank lines, as Book settings takes them. */
export const splitPassages = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((passage) => passage.trim())
    .filter(Boolean)

/** `sample_passages` is a JSON array of strings (DESIGN.md §5). */
export const storedPassages = (text: string) => JSON.stringify(splitPassages(text))

/** The stored passages as Book settings shows them, and as the AI tools read them: apart by blank lines. */
export const passagesText = (raw: string | null | undefined) =>
  parseStringList(raw)
    .map((passage) => passage.trim())
    .filter(Boolean)
    .join("\n\n")
