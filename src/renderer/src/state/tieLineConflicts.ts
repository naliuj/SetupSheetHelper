import type { SetupItemDraft } from '@shared/types/setup'
import { tieLineKey } from '@shared/utils/tieLine'

/** Maps a tie line (by tieLineKey) to the item ids that share it — only present when it's used
 *  more than once. */
export function computeTieLineConflicts(items: SetupItemDraft[]): Map<string, (number | string)[]> {
  const byTieLine = new Map<string, (number | string)[]>()
  for (const item of items) {
    if (item.tieLine == null) continue
    const key = tieLineKey(item.tieLine)
    const existing = byTieLine.get(key) ?? []
    existing.push(item.id)
    byTieLine.set(key, existing)
  }

  const conflicts = new Map<string, (number | string)[]>()
  for (const [tieLine, itemIds] of byTieLine) {
    if (itemIds.length > 1) conflicts.set(tieLine, itemIds)
  }
  return conflicts
}
