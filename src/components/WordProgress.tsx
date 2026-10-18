import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"

/** "1,234 words", or "1,234 / 3,000 words" with a bar when there's a target. */
export function WordProgress({
  words,
  target,
  label,
  className,
}: {
  words: number
  target: number | null | undefined
  /** The bar's name, e.g. "Chapter 3 word count target". */
  label: string
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground tabular-nums", className)}>
      <span>
        {formatCount(words)}
        {target ? ` / ${formatCount(target)}` : ""} words
      </span>
      {!!target && <ProgressBar value={words} max={target} label={label} className="w-24" />}
    </div>
  )
}

export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number
  max: number
  label: string
  className?: string
}) {
  const share = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${formatCount(value)} of ${formatCount(max)} words`}
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className="h-full rounded-full bg-status-done" style={{ width: `${share * 100}%` }} />
    </div>
  )
}
