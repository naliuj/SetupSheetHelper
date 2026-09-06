import type { SetupItemDraft } from '@shared/types/setup'

/** Counts how many setup items reference each id for a given field (mic or preamp — outboard
 *  usage is computed separately by computeOutboardUsageCounts since it spans multiple slots
 *  per item rather than being a single scalar field). */
export function computeUsageCounts(items: SetupItemDraft[], key: 'micId' | 'preampId'): Map<number, number> {
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

/** Gear identity shared across the outboard and preamp catalogs. Same normalization the rest of
 *  the app already uses to identify a piece of gear by value rather than by row id — see
 *  channelPresetResolution.ts's findMatch, and the name+manufacturer pairs that studio/setup
 *  export-import serialize. */
function gearKey(item: { name: string; manufacturer: string | null }): string {
  return `${(item.manufacturer ?? '').trim().toLowerCase()}|${item.name.trim().toLowerCase()}`
}

/**
 * Folds a second catalog's usage into this one, so a unit listed in BOTH catalogs draws on a
 * single pool of capacity instead of two independent ones.
 *
 * This exists because a handful of units are genuinely a preamp AND an outboard processor — a
 * UA 6176 is a 610 preamp plus an 1176 compressor, a Millennia STT-1 is a preamp plus EQ plus a
 * compressor — so they're listed in both catalogs on purpose (you might patch one purely as a
 * compressor). Without pooling, a studio with two 6176s would let you assign four: two from the
 * preamp column and two more from the outboard column.
 *
 * Matching is by manufacturer+name rather than a link column in the database, so the pairing
 * survives studio export/import, duplication and re-seeding — none of which carry row ids. It's
 * inert unless the same manufacturer+name appears in both catalogs.
 */
export function pooledUsageCounts<T extends { id: number; name: string; manufacturer: string | null }>(
  ownCounts: Map<number, number>,
  ownItems: T[],
  otherCounts: Map<number, number>,
  otherItems: { id: number; name: string; manufacturer: string | null }[]
): Map<number, number> {
  const otherByKey = new Map<string, number>()
  for (const item of otherItems) {
    const used = otherCounts.get(item.id) ?? 0
    if (used === 0) continue
    otherByKey.set(gearKey(item), (otherByKey.get(gearKey(item)) ?? 0) + used)
  }
  if (otherByKey.size === 0) return ownCounts

  const pooled = new Map(ownCounts)
  for (const item of ownItems) {
    const fromOther = otherByKey.get(gearKey(item))
    if (fromOther) pooled.set(item.id, (pooled.get(item.id) ?? 0) + fromOther)
  }
  return pooled
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
