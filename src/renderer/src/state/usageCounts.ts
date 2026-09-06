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
 *  export-import serialize.
 *
 *  Scoped by pool as well as by name: a 6176 in someone's Personal Gear locker is a different box
 *  from the studio's own 6176, and listAvailableForStudio unions every pool into one list, so
 *  without the pool in the key those two would wrongly share capacity. */
function gearKey(item: PoolScopedGear): string {
  const owner = item.studioId ?? item.buildingId ?? item.setupId ?? '-'
  return `${item.poolType}|${owner}|${(item.manufacturer ?? '').trim().toLowerCase()}|${item.name.trim().toLowerCase()}`
}

interface PoolScopedGear {
  id: number
  name: string
  manufacturer: string | null
  poolType: string
  studioId?: number | null
  buildingId?: number | null
  setupId?: number | null
}

export type GearKind = 'outboard' | 'preamp'

export interface GearUsage {
  /** Pooled uses charged to every field OTHER than the one asking — the "n" in "n/m in use". */
  usedByOthers(kind: GearKind, rowId: number | string, candidateId: number): number
  /** Whether picking this candidate here would push the shared pool past the unit's capacity. */
  wouldExceedCapacity(
    kind: GearKind,
    rowId: number | string,
    slotIndex: number | null,
    candidateId: number,
    capacity: number
  ): boolean
}

/**
 * Capacity accounting for outboard and preamps together, because a few units are BOTH.
 *
 * A UA 6176 is a 610 preamp plus an 1176 compressor; a Millennia STT-1 is a preamp plus EQ plus a
 * compressor. Those are listed in both catalogs deliberately, so they can be patched as either.
 * Two things follow, and the second is the subtle one:
 *
 *  1. Across rows, the two listings must share one pool — two 6176s must not become four.
 *  2. On any ONE row a unit belongs to a single column. Patching a 6176 as that channel's preamp
 *     already gives you its compressor — no extra patching, nothing more to write down — so
 *     offering it in the other column too would just be redundant information on the sheet. It's
 *     therefore blocked there rather than counted twice.
 *
 * For any unit that appears in only one catalog this reduces exactly to the old per-catalog
 * counting, so mics and ordinary outboard gear behave precisely as before.
 */
export function buildGearUsage(
  items: SetupItemDraft[],
  outboardGear: PoolScopedGear[],
  preamps: PoolScopedGear[]
): GearUsage {
  const keyByOutboardId = new Map(outboardGear.map((g) => [g.id, gearKey(g)]))
  const keyByPreampId = new Map(preamps.map((p) => [p.id, gearKey(p)]))

  // Per row: how many outboard slots hold each key, and which key (if any) its preamp holds.
  const slotHits = new Map<number | string, Map<string, number>>()
  const slotKeyAt = new Map<number | string, Map<number, string>>()
  const preampKeyOf = new Map<number | string, string>()

  for (const item of items) {
    const hits = new Map<string, number>()
    const atSlot = new Map<number, string>()
    for (const slot of item.outboards) {
      if (slot.outboardId == null) continue
      const k = keyByOutboardId.get(slot.outboardId)
      if (!k) continue
      hits.set(k, (hits.get(k) ?? 0) + 1)
      atSlot.set(slot.slotIndex, k)
    }
    slotHits.set(item.id, hits)
    slotKeyAt.set(item.id, atSlot)
    if (item.preampId != null) {
      const k = keyByPreampId.get(item.preampId)
      if (k) preampKeyOf.set(item.id, k)
    }
  }

  // A row can't hold a unit in both columns (see `heldInOtherColumn` below), so at most one of
  // these terms is ever non-zero on data this app produces. Summing rather than maxing keeps the
  // count honest for a sheet that predates the rule and already has both filled in.
  const contribution = (rowId: number | string, key: string): number =>
    (slotHits.get(rowId)?.get(key) ?? 0) + (preampKeyOf.get(rowId) === key ? 1 : 0)

  /** Does this row already claim the unit in the OTHER column? */
  const heldInOtherColumn = (kind: GearKind, rowId: number | string, key: string): boolean =>
    kind === 'outboard'
      ? preampKeyOf.get(rowId) === key
      : (slotHits.get(rowId)?.get(key) ?? 0) > 0

  const totalByKey = new Map<string, number>()
  for (const item of items) {
    const keys = new Set<string>([...(slotHits.get(item.id)?.keys() ?? [])])
    const pk = preampKeyOf.get(item.id)
    if (pk) keys.add(pk)
    for (const k of keys) totalByKey.set(k, (totalByKey.get(k) ?? 0) + contribution(item.id, k))
  }

  const keyFor = (kind: GearKind, id: number): string | undefined =>
    kind === 'outboard' ? keyByOutboardId.get(id) : keyByPreampId.get(id)

  return {
    usedByOthers(kind, rowId, candidateId) {
      const key = keyFor(kind, candidateId)
      if (!key) return 0
      return (totalByKey.get(key) ?? 0) - contribution(rowId, key)
    },
    wouldExceedCapacity(kind, rowId, slotIndex, candidateId, capacity) {
      const key = keyFor(kind, candidateId)
      if (!key) return false
      // One unit, one column per row — the other column on this row already has it.
      if (heldInOtherColumn(kind, rowId, key)) return true
      const base = (totalByKey.get(key) ?? 0) - contribution(rowId, key)
      let slots = slotHits.get(rowId)?.get(key) ?? 0
      let preamp = preampKeyOf.get(rowId) === key ? 1 : 0
      if (kind === 'outboard') {
        // Replacing whatever this slot holds today, so only re-count it once.
        const here = slotIndex != null && slotKeyAt.get(rowId)?.get(slotIndex) === key ? 1 : 0
        slots = slots - here + 1
      } else {
        preamp = 1
      }
      return base + slots + preamp > capacity
    }
  }
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
