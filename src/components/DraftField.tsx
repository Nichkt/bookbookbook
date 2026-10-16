import type { ComponentProps } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useDraft } from "./useDraft"

interface DraftProps {
  value: string
  onSave: (next: string) => Promise<unknown> | void
}

/** An Input that saves as you type (see useDraft). */
export function DraftInput({
  value,
  onSave,
  onFocus,
  onBlur,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange"> & DraftProps) {
  const draft = useDraft(value, onSave)
  return (
    <Input
      {...props}
      value={draft.value}
      onChange={(event) => draft.onChange(event.target.value)}
      onFocus={(event) => {
        draft.onFocus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        draft.onBlur()
        onBlur?.(event)
      }}
    />
  )
}

/** A Textarea that saves as you type (see useDraft). */
export function DraftTextarea({
  value,
  onSave,
  onFocus,
  onBlur,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "defaultValue" | "onChange"> & DraftProps) {
  const draft = useDraft(value, onSave)
  return (
    <Textarea
      {...props}
      value={draft.value}
      onChange={(event) => draft.onChange(event.target.value)}
      onFocus={(event) => {
        draft.onFocus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        draft.onBlur()
        onBlur?.(event)
      }}
    />
  )
}
