import type { SetupItemDraft } from '@shared/types/setup'

/** Counts how many setup items reference each id for a given field (mic or preamp — outboard
 *  usage is computed separately by computeOutboardUsageCounts since it spans multiple slots
 *  per item rather than being a single scalar field).
 *
 *  Typed on the two fields it reads rather than on SetupItemDraft, so Compare can pass its slimmer
 *  comparison items (which carry micId but no preampId) without inventing a full draft. */
export function computeUsageCounts(
  items: readonly { micId?: number | null; preampId?: number | null }[],
  key: 'micId' | 'preampId'
): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    const id = item[key]
    if (id == null) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** Outboard usage spans every slot across every item (a given outboard unit could be picked in
 *  Outboard-slot-1 on one row and Outboard-slot-2 on another) — counts every non-null
 *  outboardId across all slots, regardless of which slot index it's in. */
export function computeOutboardUsageCounts(items: SetupItemDraft[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    for (const slot of item.outboards) {
      if (slot.outboardId == null) continue
      counts.set(slot.outboardId, (counts.get(slot.outboardId) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Usage count excluding the row's own current selection, so an already-assigned item
 * never appears at-capacity in the row that's currently holding it.
 */
export function computeUsedByOthers(
  usageCounts: Map<number, number>,
  currentSelectionId: number | null,
  candidateId: number
): number {
  const total = usageCounts.get(candidateId) ?? 0
  return currentSelectionId === candidateId ? total - 1 : total
}
