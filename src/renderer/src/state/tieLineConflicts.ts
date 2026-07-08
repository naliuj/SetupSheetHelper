import type { SetupItemDraft } from '@shared/types/setup'

/** Maps a tie line number to the item ids that share it — only present when it's used more than once. */
export function computeTieLineConflicts(items: SetupItemDraft[]): Map<number, (number | string)[]> {
  const byTieLine = new Map<number, (number | string)[]>()
  for (const item of items) {
    if (item.tieLine == null) continue
    const existing = byTieLine.get(item.tieLine) ?? []
    existing.push(item.id)
    byTieLine.set(item.tieLine, existing)
  }

  const conflicts = new Map<number, (number | string)[]>()
  for (const [tieLine, itemIds] of byTieLine) {
    if (itemIds.length > 1) conflicts.set(tieLine, itemIds)
  }
  return conflicts
}
