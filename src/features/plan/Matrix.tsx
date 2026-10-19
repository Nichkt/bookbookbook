import { MoonIcon } from "lucide-react"
import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react"
import { Link } from "react-router"
import { attempt } from "@/app/feedback"
import { DeferredMenu } from "@/components/DeferredMenu"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { MentionCounts } from "@/features/codex/appearances"
import { useAppearances } from "@/features/codex/useAppearances"
import { cn } from "@/lib/utils"
import { buildMatrix, stretchLabel, type MatrixMark, type MatrixRow, type QuietStretch } from "./matrixData"
import { setChapterLink, setCharacterInChapter, type CharacterPart } from "./mutations"
import { usePlanContext } from "./planContext"
import type { PlanChapter } from "./planData"
import { chapterTitle } from "./status"

/*
 * The Matrix (DESIGN.md §6): who and what is in each chapter. A grid: arrow keys move between cells, Home and End
 * go to the ends of a row, Ctrl+Home and Ctrl+End to the corners.
 */

const LEGEND_ID = "matrix-legend"

const PART_LABELS: Record<CharacterPart, string> = {
  none: "Not in this chapter",
  present: "Present",
  pov: "Point of view",
}

const isPart = (value: string): value is CharacterPart => value in PART_LABELS

/** Every control in the grid, so focus can move between them. */
const cellSelector = (row: number, col: number) => `[data-grid-row="${row}"][data-grid-col="${col}"]`

/** Clear of the sticky toolbar above and the names column on the left. */
const cellScroll = "scroll-mt-28 scroll-mb-8 scroll-ml-32 sm:scroll-ml-48 pointer-coarse:scroll-mt-30"

const cellButton = cn(
  "grid size-9 place-items-center rounded-md text-base leading-none outline-none transition-colors pointer-coarse:size-11",
  "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60",
  cellScroll,
)

interface Cell {
  row: number
  col: number
}

function mentionCounts(byEntry: ReturnType<typeof useAppearances>["byEntry"]): MentionCounts {
  const counts = new Map<string, Map<string, number>>()
  for (const [entryId, appearances] of byEntry) {
    const byChapter = new Map<string, number>()
    for (const appearance of appearances) {
      if (appearance.mentions > 0) byChapter.set(appearance.chapterId, appearance.mentions)
    }
    if (byChapter.size > 0) counts.set(entryId, byChapter)
  }
  return counts
}

export function Matrix() {
  const { bookId, plan, matches, filtering, showChapter } = usePlanContext()
  const { byEntry } = useAppearances(bookId)
  const mentions = useMemo(() => mentionCounts(byEntry), [byEntry])
  const matrix = useMemo(() => buildMatrix(plan, mentions), [plan, mentions])
  const tableRef = useRef<HTMLTableElement>(null)
  const [active, setActive] = useState<Cell>({ row: 1, col: 1 })

  const rows = [...matrix.characters, ...matrix.threads]
  const rowCount = rows.length + 1
  const colCount = matrix.columns.length + 1
  // Keep one control tabbable as rows and columns come and go. The top-left corner has none.
  const activeRow = Math.min(active.row, rowCount - 1)
  const activeCol = Math.max(activeRow === 0 ? 1 : 0, Math.min(active.col, colCount - 1))
  const tabIndexOf = (row: number, col: number) => (row === activeRow && col === activeCol ? 0 : -1)

  const quiet = matrix.threads.filter((row) => row.quiet.length > 0)

  if (matrix.columns.length === 0) {
    return <MatrixEmpty>No chapters yet. Add one with the Chapter button above.</MatrixEmpty>
  }
  if (rows.length === 0) {
    return (
      <MatrixEmpty>
        The Matrix shows which characters and story points are in each chapter. Add some in the World first.
        <Link to={`/b/${bookId}/world`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
          Open the World
        </Link>
      </MatrixEmpty>
    )
  }

  const onFocusCapture = (event: FocusEvent<HTMLTableElement>) => {
    const { gridRow, gridCol } = (event.target as HTMLElement).dataset
    if (gridRow === undefined || gridCol === undefined) return
    const row = Number(gridRow)
    const col = Number(gridCol)
    if (row !== active.row || col !== active.col) setActive({ row, col })
  }

  // Capture, so the arrows move between cells before a cell's menu can take them.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLTableElement>) => {
    const { gridRow, gridCol } = (event.target as HTMLElement).dataset
    if (gridRow === undefined || gridCol === undefined || event.altKey || event.shiftKey) return
    const row = Number(gridRow)
    const col = Number(gridCol)
    const corner = event.ctrlKey || event.metaKey
    let next: Cell
    switch (event.key) {
      case "ArrowRight":
        next = { row, col: col + 1 }
        break
      case "ArrowLeft":
        next = { row, col: col - 1 }
        break
      case "ArrowDown":
        next = { row: row + 1, col }
        break
      case "ArrowUp":
        next = { row: row - 1, col }
        break
      case "Home":
        next = corner ? { row: 0, col: 1 } : { row, col: row === 0 ? 1 : 0 }
        break
      case "End":
        next = corner ? { row: rowCount - 1, col: colCount - 1 } : { row, col: colCount - 1 }
        break
      default:
        return
    }
    event.preventDefault()
    const target = tableRef.current?.querySelector<HTMLElement>(cellSelector(next.row, next.col))
    if (!target) return
    setActive(next)
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  const columnClass = (chapter: PlanChapter) =>
    cn(filtering && !matches(chapter) && "opacity-35 focus-within:opacity-100 hover:opacity-80")
  const span = matrix.columns.length + 1

  return (
    <div className="px-4 pt-4 pb-10 sm:px-6">
      <Legend />
      {quiet.length > 0 && <QuietNote rows={quiet} columns={matrix.columns} />}
      <div data-tour="plan-matrix" className="relative w-fit max-w-full overflow-x-auto rounded-xl border bg-page shadow-sm">
        <table
          ref={tableRef}
          role="grid"
          aria-label="Matrix: who and what is in each chapter"
          aria-describedby={LEGEND_ID}
          data-matrix=""
          className="border-separate border-spacing-0 text-sm"
          onFocusCapture={onFocusCapture}
          onKeyDownCapture={onKeyDownCapture}
        >
          <thead>
            {matrix.acts.length > 0 && (
              <tr>
                <td className="sticky left-0 z-10 bg-page" />
                {matrix.acts.map((act) => (
                  <th
                    key={act.key}
                    scope="colgroup"
                    colSpan={act.span}
                    className="max-w-0 border-b border-l px-2 pt-2 pb-1 text-left text-xs font-semibold text-ink-2"
                  >
                    <span className="block truncate" title={act.label}>
                      {act.label}
                    </span>
                  </th>
                ))}
              </tr>
            )}
            <tr>
              <td className="sticky left-0 z-10 border-b bg-page" />
              {matrix.columns.map((chapter, index) => {
                const title = `Chapter ${chapter.number}: ${chapterTitle(chapter.title)}`
                return (
                  <th
                    key={chapter.id}
                    scope="col"
                    className={cn("border-b p-0.5 text-center", columnClass(chapter))}
                    title={title}
                  >
                    <button
                      type="button"
                      data-grid-row={0}
                      data-grid-col={index + 1}
                      data-focus-chapter={chapter.id}
                      data-open-chapter={chapter.id}
                      tabIndex={tabIndexOf(0, index + 1)}
                      aria-label={title}
                      onClick={() => showChapter(chapter.id)}
                      className={cn(cellButton, "text-xs font-semibold text-ink-2 tabular-nums")}
                    >
                      {chapter.number}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.characters.length > 0 && <SectionRow span={span}>Characters</SectionRow>}
            {matrix.characters.map((row, index) => (
              <EntryRow
                key={row.entry.id}
                row={row}
                gridRow={index + 1}
                columns={matrix.columns}
                tabIndexOf={tabIndexOf}
                columnClass={columnClass}
              />
            ))}
            {matrix.threads.length > 0 && <SectionRow span={span}>Story points</SectionRow>}
            {matrix.threads.map((row, index) => (
              <EntryRow
                key={row.entry.id}
                row={row}
                gridRow={matrix.characters.length + index + 1}
                columns={matrix.columns}
                tabIndexOf={tabIndexOf}
                columnClass={columnClass}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatrixEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-10 sm:px-6">
      <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <p id={LEGEND_ID} className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <Mark mark="pov" color="currentColor" /> Point of view
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Mark mark="present" color="currentColor" /> In the chapter
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Mark mark="mentioned" color="currentColor" /> Named in the text, but not marked present
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block size-3.5 rounded-sm bg-status-drafting/20" /> A story point
        gone quiet
      </span>
    </p>
  )
}

function Mark({ mark, color }: { mark: MatrixMark; color: string }) {
  if (mark === "none") return <span aria-hidden="true" className="size-1 rounded-full bg-border" />
  const glyph = mark === "pov" ? "★" : mark === "present" ? "●" : "○"
  return (
    <span aria-hidden="true" className={cn(mark === "mentioned" && "text-muted-foreground")} style={mark === "mentioned" ? undefined : { color }}>
      {glyph}
    </span>
  )
}

function QuietNote({ rows, columns }: { rows: MatrixRow[]; columns: readonly PlanChapter[] }) {
  return (
    <div role="note" className="mb-3 flex items-start gap-2 rounded-lg border border-status-drafting/40 bg-status-drafting/8 px-3 py-2 text-sm text-ink-2">
      <MoonIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-drafting" />
      <p>
        {rows.map((row, index) => (
          <span key={row.entry.id}>
            {index > 0 && " "}
            <strong className="font-semibold text-ink">{row.entry.name}</strong> goes quiet for{" "}
            {row.quiet.map((stretch) => stretchLabel(stretch, columns)).join(" and ")}.
          </span>
        ))}{" "}
        Readers can forget a story point that's away for long.
      </p>
    </div>
  )
}

function SectionRow({ span, children }: { span: number; children: ReactNode }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={span} className="border-b bg-surface px-0 py-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="sticky left-0 px-3">{children}</span>
      </th>
    </tr>
  )
}

interface EntryRowProps {
  row: MatrixRow
  gridRow: number
  columns: readonly PlanChapter[]
  tabIndexOf: (row: number, col: number) => number
  columnClass: (chapter: PlanChapter) => string
}

function EntryRow({ row, gridRow, columns, tabIndexOf, columnClass }: EntryRowProps) {
  const { bookId } = usePlanContext()
  const { entry } = row
  const quietText = row.quiet.map((stretch) => stretchLabel(stretch, columns)).join(" and ")
  const quietAt = (index: number) => row.quiet.find((stretch) => index >= stretch.from && index <= stretch.to)
  return (
    <tr className="group/row">
      <th scope="row" className="sticky left-0 z-10 w-32 max-w-32 min-w-32 border-b bg-page p-0 text-left font-normal group-hover/row:bg-surface sm:w-48 sm:max-w-48 sm:min-w-48">
        <Link
          to={`/b/${bookId}/world/${entry.id}`}
          data-grid-row={gridRow}
          data-grid-col={0}
          tabIndex={tabIndexOf(gridRow, 0)}
          title={entry.name}
          className={cn(
            "flex min-h-10 items-center gap-2 rounded-md px-3 py-1 text-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset pointer-coarse:min-h-12",
            "scroll-mt-28 scroll-mb-8 pointer-coarse:scroll-mt-30",
          )}
        >
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {quietText && (
            <span title={`Quiet for ${quietText}`} className="shrink-0 text-status-drafting">
              <MoonIcon aria-hidden="true" className="size-3.5" />
              <span className="sr-only">, quiet for {quietText}</span>
            </span>
          )}
        </Link>
      </th>
      {columns.map((chapter, index) => {
        const stretch = quietAt(index)
        return (
          <td
            key={chapter.id}
            className={cn(
              "border-b p-0.5 text-center group-hover/row:bg-surface/60",
              stretch && "bg-status-drafting/12 group-hover/row:bg-status-drafting/20",
              columnClass(chapter),
            )}
          >
            {row.kind === "character" ? (
              <CharacterCell row={row} index={index} chapter={chapter} gridRow={gridRow} tabIndex={tabIndexOf(gridRow, index + 1)} />
            ) : (
              <ThreadCell
                row={row}
                index={index}
                chapter={chapter}
                gridRow={gridRow}
                tabIndex={tabIndexOf(gridRow, index + 1)}
                stretch={stretch}
                columns={columns}
              />
            )}
          </td>
        )
      })}
    </tr>
  )
}

interface CellProps {
  row: MatrixRow
  index: number
  chapter: PlanChapter
  gridRow: number
  tabIndex: number
}

function CharacterCell({ row, index, chapter, gridRow, tabIndex }: CellProps) {
  const { db, plan } = usePlanContext()
  const { entry } = row
  const mark = row.marks[index]
  const part: CharacterPart = mark === "pov" ? "pov" : mark === "present" ? "present" : "none"
  const mentions = row.mentions[index]
  const other = chapter.pov_entry_id && chapter.pov_entry_id !== entry.id ? plan.entries.get(chapter.pov_entry_id) : undefined
  const named = mentions === 1 ? "named once in the text" : `named ${mentions} times in the text`
  const state =
    mark === "pov"
      ? "point of view"
      : mark === "present"
        ? "present"
        : mark === "mentioned"
          ? `${named}, not marked present`
          : "not in this chapter"

  const choose = (value: string) => {
    if (!isPart(value) || value === part) return
    void attempt("update chapter", setCharacterInChapter(db, chapter.id, entry.id, value))
  }

  return (
    <DeferredMenu
      trigger={
        <button
          type="button"
          data-grid-row={gridRow}
          data-grid-col={index + 1}
          data-matrix-cell=""
          tabIndex={tabIndex}
          aria-label={`${entry.name} in chapter ${chapter.number}: ${state}`}
          className={cn(cellButton, "mx-auto")}
        >
          <Mark mark={mark} color={entry.color} />
        </button>
      }
    >
      <DropdownMenuContent align="center" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="font-semibold text-ink">{entry.name}</span> in chapter {chapter.number}
          <span className="block truncate text-xs text-muted-foreground">{chapterTitle(chapter.title)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={part} onValueChange={choose}>
          <DropdownMenuRadioItem value="none">{PART_LABELS.none}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="present">{PART_LABELS.present}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="pov">
            <span>
              {PART_LABELS.pov}
              {other && <span className="block text-xs text-muted-foreground">Instead of {other.name}</span>}
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {mentions > 0 && (
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            {mentions === 1 ? "Named once in this chapter's text." : `Named ${mentions} times in this chapter's text.`}
          </p>
        )}
      </DropdownMenuContent>
    </DeferredMenu>
  )
}

function ThreadCell({
  row,
  index,
  chapter,
  gridRow,
  tabIndex,
  stretch,
  columns,
}: CellProps & { stretch: QuietStretch | undefined; columns: readonly PlanChapter[] }) {
  const { db } = usePlanContext()
  const { entry } = row
  const on = row.marks[index] === "present"
  const quiet = stretch ? ` (quiet for ${stretchLabel(stretch, columns)})` : ""
  return (
    <button
      type="button"
      data-grid-row={gridRow}
      data-grid-col={index + 1}
      data-matrix-cell=""
      tabIndex={tabIndex}
      aria-pressed={on}
      aria-label={`${entry.name} in chapter ${chapter.number}${quiet}`}
      onClick={() => void attempt("update story points", setChapterLink(db, chapter.id, "thread", entry.id, !on))}
      className={cn(cellButton, "mx-auto")}
    >
      <Mark mark={on ? "present" : "none"} color={entry.color} />
    </button>
  )
}
