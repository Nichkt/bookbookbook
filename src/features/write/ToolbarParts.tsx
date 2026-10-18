import type { Editor } from "@tiptap/react"
import type { LucideIcon } from "lucide-react"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DictateButton } from "@/features/dictation/DictateButton"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { command } from "./formatting"
import { DICTATE_KEYS, PROSE_TARGET } from "./proseDictation"
import { stopReading } from "./readAloud"

/* Pieces of the Write screen's toolbars: the one at the top (WriteToolbar.tsx) and the one above the keyboard. */

export const Divider = () => <div aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />

interface DictateProseProps {
  editor: Editor | undefined
  /** For the word "Dictate", e.g. "sr-only xl:not-sr-only" to show only the microphone below xl. */
  labelClassName: string
  size?: "sm" | "icon-sm"
}

/** Dictation into the text (DESIGN.md §10). Reading aloud stops as it starts, as the microphone would hear it. */
export const DictateProse = ({ editor, labelClassName, size = "sm" }: DictateProseProps) => (
  <DictateButton
    target={PROSE_TARGET}
    keys={DICTATE_KEYS}
    variant="ghost"
    size={size}
    labelClassName={labelClassName}
    disabled={!editor}
    onStart={() => stopReading()}
    className="shrink-0 text-ink-2"
  />
)

interface FormatToggleProps {
  label: string
  /** As shortcutLabel takes them, e.g. "Mod+Shift+B". */
  keys: string
  icon: LucideIcon
  pressed: boolean
  editor: Editor | undefined
  run: (editor: Editor) => void
}

export function FormatToggle({ label, keys, icon: Icon, pressed, editor, run }: FormatToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          aria-label={label}
          aria-keyshortcuts={ariaShortcut(keys)}
          pressed={pressed}
          disabled={!editor}
          // Keeps the selection in the text, so the format applies to it.
          onMouseDown={(event) => event.preventDefault()}
          onPressedChange={() => command(run)}
          className="shrink-0 text-ink-2"
        >
          <Icon />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>
        {label} · {shortcutLabel(keys)}
      </TooltipContent>
    </Tooltip>
  )
}
