import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { arrayMove, rectSortingStrategy, SortableContext } from "@dnd-kit/sortable"
import { PlusIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { attempt } from "@/app/feedback"
import { DraftInput } from "@/components/DraftField"
import { byData, focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { ActMenu } from "./ActMenu"
import {
  cloneOrder,
  groupOf,
  isGroupKey,
  landsAfter,
  moveToGroup,
  placeOf,
  sameOrder,
  type BoardOrder,
} from "./boardDnd"
import { BOARD_CARD_HELP_ID, ChapterCardOverlay, SortableChapterCard } from "./ChapterCard"
import { capitalize, chapterName, relocateChapter } from "./commands"
import { IndexCardOverlay, SortableIndexCard } from "./IndexCard"
import { createChapter, renameAct } from "./mutations"
import { usePlanContext } from "./planContext"
import { LOOSE_GROUP, type Plan, type PlanGroup } from "./planData"
import { actLabel } from "./status"
import { StructureRibbon } from "./StructureRibbon"

/** How long the board shows a dropped card in its new place while the database catches up. */
const SETTLE_MS = 1500
/** The click a drop can cause on whatever is under the pointer. */
const CLICK_GUARD_MS = 100

const orderOf = (plan: Plan): BoardOrder =>
  Object.fromEntries(plan.groups.map((group) => [group.key, group.chapters.map((chapter) => chapter.id)]))

/** The Board's chapter cards, or the Corkboard's index cards. */
export type BoardCards = "chapter" | "index"

/**
 * The Board and the Corkboard (DESIGN.md §6): acts as bands of cards. Drag cards within and between acts (mouse, or
 * a long press on touch); from the keyboard, Alt+arrows on a card do the same. The Corkboard's index cards hold just
 * the title and summary, edited on the card, and drag by a handle so their text can be selected.
 */
export function Board({ cards }: { cards: BoardCards }) {
  const { db, plan } = usePlanContext()
  const derived = useMemo(() => orderOf(plan), [plan])
  /** The order while a drag is in progress. */
  const [dragOrder, setDragOrder] = useState<BoardOrder | null>(null)
  /** The dropped order, until the live query shows it. */
  const [settling, setSettling] = useState<BoardOrder | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const working = useRef<BoardOrder | null>(null)
  const lastOverId = useRef<UniqueIdentifier | null>(null)
  const movedGroup = useRef(false)
  const clicksBlockedUntil = useRef(0)
  const order = dragOrder ?? settling ?? derived

  // The live query has caught up with the drop.
  if (settling && sameOrder(settling, derived)) setSettling(null)

  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => setSettling(null), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [settling])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      movedGroup.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [dragOrder])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  // Over a band, aim at its nearest card; between bands, stay with the last target so cards don't flicker.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const current = working.current ?? order
      const pointerHits = pointerWithin(args)
      const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args)
      let overId = getFirstCollision(hits, "id")
      if (overId != null) {
        const key = String(overId)
        if (isGroupKey(current, key) && current[key].length > 0) {
          const members = current[key]
          overId =
            closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) => container.id !== overId && members.includes(String(container.id)),
              ),
            })[0]?.id ?? overId
        }
        lastOverId.current = overId
        return [{ id: overId }]
      }
      if (movedGroup.current) lastOverId.current = args.active.id
      return lastOverId.current != null ? [{ id: lastOverId.current }] : []
    },
    [order],
  )

  const nameOf = (id: UniqueIdentifier) => {
    const chapter = plan.chapterById.get(String(id))
    return chapter ? chapterName(chapter) : "the chapter"
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: ({ active }) => `${capitalize(nameOf(active.id))} is back where it was.`,
  }

  const setWorking = (next: BoardOrder | null) => {
    working.current = next
    setDragOrder(next)
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    lastOverId.current = null
    setWorking(cloneOrder(order))
    setActiveId(String(active.id))
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const current = working.current
    if (!current || !over) return
    const id = String(active.id)
    const overId = String(over.id)
    const from = groupOf(current, id)
    const to = groupOf(current, overId)
    if (!from || !to || from === to) return
    // Once a book has acts, every chapter belongs to one: "Not in an act" only holds strays.
    if (to === LOOSE_GROUP && plan.hasActs) return
    const members = current[to]
    let index = members.length
    if (overId !== to) {
      const overIndex = members.indexOf(overId)
      if (overIndex !== -1) index = overIndex + (landsAfter(active.rect.current.translated, over.rect) ? 1 : 0)
    }
    movedGroup.current = true
    setWorking(moveToGroup(current, id, to, index))
  }

  const endDrag = () => {
    setWorking(null)
    setActiveId(null)
    clicksBlockedUntil.current = performance.now() + CLICK_GUARD_MS
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = working.current
    endDrag()
    if (!current || !over) return
    const id = String(active.id)
    const overId = String(over.id)
    let final = current
    const group = groupOf(current, id)
    if (group && group === groupOf(current, overId) && overId !== group) {
      const from = current[group].indexOf(id)
      const to = current[group].indexOf(overId)
      if (from !== to && to !== -1) final = { ...current, [group]: arrayMove(current[group], from, to) }
    }
    const place = placeOf(final, id)
    const before = placeOf(derived, id)
    if (!place || (place.group === LOOSE_GROUP && plan.hasActs)) return
    if (before && before.group === place.group && before.index === place.index) return
    const target = plan.groups.find((candidate) => candidate.key === place.group)
    if (!target) return
    setSettling(final)
    void relocateChapter(db, plan, id, target, place.index, null)
  }

  const blockStrayClick = (event: MouseEvent) => {
    if (performance.now() < clicksBlockedUntil.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const active = activeId ? plan.chapterById.get(activeId) : undefined
  const activeGroup = activeId ? groupOf(order, activeId) : undefined

  return (
    <div className="px-4 pt-4 pb-10 sm:px-6" onClickCapture={blockStrayClick}>
      <p id={BOARD_CARD_HELP_ID} hidden>
        Enter opens details. Alt plus arrow keys move the chapter.
      </p>
      <StructureRibbon />
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{ announcements, screenReaderInstructions: { draggable: "" } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="space-y-6">
          {plan.groups.map((group) => (
            <BoardGroup
              key={group.key}
              cards={cards}
              group={group}
              ids={(order[group.key] ?? []).filter((id) => plan.chapterById.has(id))}
              highlighted={activeGroup === group.key}
            />
          ))}
        </div>
        {createPortal(
          <DragOverlay>
            {active && cards === "index" && <IndexCardOverlay chapter={active} />}
            {active && cards === "chapter" && <ChapterCardOverlay chapter={active} />}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  )
}

function BoardGroup({
  cards,
  group,
  ids,
  highlighted,
}: {
  cards: BoardCards
  group: PlanGroup
  ids: string[]
  highlighted: boolean
}) {
  const { db, bookId, plan, showNewChapter } = usePlanContext()
  const stray = !group.act && plan.hasActs
  const { setNodeRef } = useDroppable({ id: group.key, disabled: stray })
  const label = actLabel(group, plan.hasActs)
  const headingId = `board-group-${group.key}`
  const act = group.act

  const addChapter = async (event: MouseEvent<HTMLButtonElement>) => {
    const tile = event.currentTarget
    const id = await attempt("add chapter", createChapter(db, bookId, { actId: act?.id ?? null }))
    if (!id) return
    // An index card's title is written on the card.
    if (cards === "index") focusSoon(byData("index-title", id))
    else showNewChapter(id, tile)
  }

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "-mx-2 rounded-2xl px-2 py-2 transition-colors sm:-mx-3 sm:px-3",
        highlighted && "bg-surface-2/60 ring-1 ring-border",
      )}
    >
      <header data-tour="plan-act" className="mb-2 flex min-h-9 items-center gap-2">
        {act ? (
          <>
            <h2 id={headingId} className="sr-only">
              {label}
            </h2>
            <DraftInput
              value={act.title ?? ""}
              onSave={(title) => renameAct(db, act.id, title)}
              data-act-title={act.id}
              aria-label={`Title of act ${group.index + 1}`}
              placeholder={`Act ${group.index + 1}`}
              className="h-9 w-auto min-w-0 flex-initial border-transparent bg-transparent px-1.5 font-heading text-lg font-semibold shadow-none field-sizing-content hover:border-input md:text-lg dark:bg-transparent"
            />
          </>
        ) : (
          <h2 id={headingId} className="px-1.5 font-heading text-lg font-semibold">
            {label}
          </h2>
        )}
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatCount(group.words)}
          {group.target > 0 && ` / ${formatCount(group.target)}`} words
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <ActMenu group={group} />
        </div>
      </header>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={cn("flex flex-wrap", cards === "index" ? "gap-4" : "items-start gap-3")}>
          {ids.length > 0 && (
            // The list's box steps aside, so the add tile flows on after the last card.
            <ul aria-labelledby={headingId} className="contents">
              {ids.map((id) =>
                cards === "index" ? (
                  <SortableIndexCard key={id} chapter={plan.chapterById.get(id)!} />
                ) : (
                  <SortableChapterCard key={id} chapter={plan.chapterById.get(id)!} />
                ),
              )}
            </ul>
          )}
          {!stray && (
            <AddChapterTile
              cards={cards}
              groupKey={group.key}
              label={plan.hasActs ? label : null}
              onClick={(event) => void addChapter(event)}
            />
          )}
          {ids.length === 0 && (
            <p className="self-center px-1 text-sm text-muted-foreground">
              {act ? "No chapters in this act yet. Add one, or drag one here." : "No chapters yet. Add one to start planning."}
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

/** The big button after an act's last card, or a book's when it has no acts, that adds a chapter there. */
function AddChapterTile({
  cards,
  groupKey,
  label,
  onClick,
}: {
  cards: BoardCards
  groupKey: string
  /** The act, for a screen reader; null in a book without acts. */
  label: string | null
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      data-add-chapter={groupKey}
      data-tour="plan-add-chapter"
      onClick={onClick}
      className={cn(
        "group/add flex min-h-24 w-full flex-col items-center justify-center gap-2 self-stretch border-2 border-dashed border-border px-4 py-5 text-sm font-medium text-ink-2 transition-colors outline-none hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        cards === "index" ? "rounded-sm sm:w-[280px]" : "rounded-xl sm:w-[268px]",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition-colors group-hover/add:bg-primary/10 group-hover/add:text-primary"
      >
        <PlusIcon className="size-5" />
      </span>
      <span>
        Add a chapter
        {label && <span className="sr-only"> to {label}</span>}
      </span>
    </button>
  )
}
