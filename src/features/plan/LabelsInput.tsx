import { XIcon } from "lucide-react"
import { useRef, useState, type KeyboardEvent } from "react"
import { announce, attempt } from "@/app/feedback"
import { uniqueStrings } from "@/lib/json"
import { isComposing } from "@/lib/keys"

interface LabelsInputProps {
  id: string
  labels: readonly string[]
  /** Labels used elsewhere in the book. */
  suggestions: readonly string[]
  onChange: (labels: string[]) => Promise<unknown> | void
}

/** Free-text labels as chips. Enter or a comma adds one; Backspace in the empty field removes the last. */
export function LabelsInput({ id, labels, suggestions, onChange }: LabelsInputProps) {
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `${id}-suggestions`
  const taken = new Set(labels.map((label) => label.toLowerCase()))

  const save = (next: string[]) => void attempt("save labels", Promise.resolve(onChange(next)))

  const add = (raw: string) => {
    setText("")
    const next = uniqueStrings([...labels, ...raw.split(",")])
    if (next.length !== labels.length) save(next)
  }

  const remove = (label: string) => {
    save(labels.filter((candidate) => candidate !== label))
    announce(`Removed label ${label}`)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event.nativeEvent)) return
    if (event.key === "Enter" || event.key === ",") {
      if (event.key === "," || text.trim()) event.preventDefault()
      if (text.trim()) add(text)
    } else if (event.key === "Backspace" && !text && labels.length > 0) {
      event.preventDefault()
      remove(labels[labels.length - 1])
    }
  }

  return (
    <div className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 pointer-coarse:gap-2 pointer-coarse:py-0 dark:bg-input/30">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-muted py-0.5 pr-0.5 pl-2 text-xs pointer-coarse:pl-3 pointer-coarse:text-sm"
        >
          <span className="truncate">{label}</span>
          {/* On touch screens the ::after stretches the hit area to 44px, clear of the next chip. */}
          <button
            type="button"
            aria-label={`Remove label ${label}`}
            onClick={() => remove(label)}
            className="relative grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
          >
            <XIcon aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        list={listId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && add(text)}
        placeholder={labels.length > 0 ? "" : "Add a label…"}
        className="h-6 min-w-20 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm pointer-coarse:h-11 pointer-coarse:min-w-11"
      />
      <datalist id={listId}>
        {suggestions
          .filter((suggestion) => !taken.has(suggestion.toLowerCase()))
          .map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
      </datalist>
    </div>
  )
}
