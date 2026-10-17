import { XIcon } from "lucide-react"
import { useRef, useState, type KeyboardEvent } from "react"
import { announce, attempt } from "@/app/feedback"
import { uniqueStrings } from "@/lib/json"
import { isComposing } from "@/lib/keys"

interface ChipsInputProps {
  id: string
  values: readonly string[]
  /** What one chip is, for screen readers: "label" makes "Remove label Hope". */
  noun: string
  placeholder: string
  /** Values used elsewhere, offered as the writer types. */
  suggestions?: readonly string[]
  "aria-describedby"?: string
  onChange: (values: string[]) => Promise<unknown> | void
}

/**
 * Short free-text values as chips: labels, tags, aliases. Enter or a comma adds one; Backspace in the empty field
 * removes the last. Repeats, ignoring case, aren't added.
 */
export function ChipsInput({
  id,
  values,
  noun,
  placeholder,
  suggestions = [],
  "aria-describedby": describedBy,
  onChange,
}: ChipsInputProps) {
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `${id}-suggestions`
  const taken = new Set(values.map((value) => value.toLowerCase()))
  const offered = suggestions.filter((suggestion) => !taken.has(suggestion.toLowerCase()))

  const save = (next: string[]) => void attempt(`save ${noun}`, Promise.resolve(onChange(next)))

  const add = (raw: string) => {
    setText("")
    const next = uniqueStrings([...values, ...raw.split(",")])
    if (next.length !== values.length) save(next)
  }

  const remove = (value: string) => {
    save(values.filter((candidate) => candidate !== value))
    announce(`Removed ${noun} ${value}`)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event.nativeEvent)) return
    if (event.key === "Enter" || event.key === ",") {
      if (event.key === "," || text.trim()) event.preventDefault()
      if (text.trim()) add(text)
    } else if (event.key === "Backspace" && !text && values.length > 0) {
      event.preventDefault()
      remove(values[values.length - 1])
    }
  }

  return (
    <div className="flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 pointer-coarse:gap-2 pointer-coarse:py-0 dark:bg-input/30">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-muted py-0.5 pr-0.5 pl-2 text-xs pointer-coarse:pl-3 pointer-coarse:text-sm"
        >
          <span className="truncate">{value}</span>
          {/* On touch screens the ::after stretches the hit area to 44px, clear of the next chip. */}
          <button
            type="button"
            aria-label={`Remove ${noun} ${value}`}
            onClick={() => remove(value)}
            className="relative grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
          >
            <XIcon aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        list={offered.length > 0 ? listId : undefined}
        aria-describedby={describedBy}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && add(text)}
        placeholder={values.length > 0 ? "" : placeholder}
        className="h-6 w-0 min-w-20 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm pointer-coarse:h-11 pointer-coarse:min-w-11"
      />
      {offered.length > 0 && (
        <datalist id={listId}>
          {offered.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </div>
  )
}
