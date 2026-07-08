import type { SetupItemDraft } from '@shared/types/setup'

/** Counts how many setup items reference each id for a given field (e.g. micId, outboardId). */
export function computeUsageCounts(
  items: SetupItemDraft[],
  key: 'micId' | 'outboardId'
): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    const id = item[key]
    if (id == null) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
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
