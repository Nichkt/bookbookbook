import type { ClientRect } from "@dnd-kit/core"

/** Chapter ids per board group (act id or LOOSE_GROUP), in order. */
export type BoardOrder = Record<string, string[]>

const hasKey = (order: BoardOrder, key: string) => Object.prototype.hasOwnProperty.call(order, key)

export const cloneOrder = (order: BoardOrder): BoardOrder =>
  Object.fromEntries(Object.entries(order).map(([key, ids]) => [key, [...ids]]))

export function sameOrder(a: BoardOrder, b: BoardOrder): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => {
    const left = a[key]
    const right = hasKey(b, key) ? b[key] : undefined
    return !!right && left.length === right.length && left.every((id, index) => id === right[index])
  })
}

export const isGroupKey = (order: BoardOrder, id: string) => hasKey(order, id)

/** The group holding `id`; a group key is its own group. */
export function groupOf(order: BoardOrder, id: string): string | undefined {
  if (hasKey(order, id)) return id
  return Object.keys(order).find((key) => order[key].includes(id))
}

/**
 * Whether the dragged card should land after the card it's over. Cards wrap in rows, so compare along whichever axis
 * separates their centers more, relative to the card's shape.
 */
export function landsAfter(active: ClientRect | null | undefined, over: ClientRect): boolean {
  if (!active) return false
  const dx = active.left + active.width / 2 - (over.left + over.width / 2)
  const dy = active.top + active.height / 2 - (over.top + over.height / 2)
  return Math.abs(dx) * over.height > Math.abs(dy) * over.width ? dx > 0 : dy > 0
}

/** `id` taken out of its group and put in `to` at `index`. */
export function moveToGroup(order: BoardOrder, id: string, to: string, index: number): BoardOrder {
  const next: BoardOrder = {}
  for (const [key, ids] of Object.entries(order)) next[key] = ids.filter((candidate) => candidate !== id)
  const target = next[to] ?? []
  const at = Math.max(0, Math.min(index, target.length))
  next[to] = [...target.slice(0, at), id, ...target.slice(at)]
  return next
}

/** Where `id` sits: its group and index. */
export function placeOf(order: BoardOrder, id: string): { group: string; index: number } | null {
  const group = groupOf(order, id)
  if (!group || group === id) return null
  return { group, index: order[group].indexOf(id) }
}
