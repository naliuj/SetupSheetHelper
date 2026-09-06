import { formatGearLabel, gearIdentityKey } from '@shared/utils/manufacturerPrefix'

/** Which pool to spend first when the same model is stocked in more than one. Studio gear is the
 *  room you're actually in, session gear was borrowed for this date specifically, and the shared
 *  pools are last because taking one denies it to everyone else. This mirrors the order
 *  `listAvailableForStudio` already unions the pools in — an order both `findMatch` call sites
 *  (setup import, channel presets) silently depend on — so make it explicit rather than incidental. */
export const POOL_PRECEDENCE = ['studio', 'setup', 'building', 'personal', 'faculty_reserve']

function precedenceOf(poolType: string): number {
  const i = POOL_PRECEDENCE.indexOf(poolType)
  return i === -1 ? POOL_PRECEDENCE.length : i
}

export interface GearSearchGroup<T> {
  key: string
  label: string
  /** Which pools stock this model, when it's more than one — shown as a hint on the row. */
  hint?: string
  /** Combined uses across every pool, excluding this row's own current hold. */
  used: number
  /** Combined stock across every pool. */
  capacity: number
  disabled: boolean
  /** The row a click assigns: the first pool with stock left, in POOL_PRECEDENCE order. */
  pick: T
  memberIds: number[]
}

interface Options<T> {
  capacity: (item: T) => number
  usedByOthers: (item: T) => number
  /** Whether this specific row can take one more — for outboard this is slot-aware, so it can't
   *  be derived from `usedByOthers >= capacity`. */
  isFull: (item: T) => boolean
  poolLabel: (item: T) => string
}

/**
 * Collapses a model stocked in several pools into ONE search row.
 *
 * Searching "SM-57" in Studio A used to return two rows — the studio's four and the building
 * office's two — identical apart from their counts, with no way to tell which was which. They're
 * the same microphone, so this presents one row reading `0/6` and spends the studio's copies
 * before reaching for the building's.
 *
 * Deliberately search-only: the picker's browse tree still lists each pool separately, so asking
 * for a Building Office copy specifically remains possible. And deliberately NOT done by widening
 * `gearKey` in usageCounts.ts — that key keeps the pool in it on purpose, so a Personal-locker unit
 * never shares capacity with the studio's identically-named one.
 */
export function buildGearSearchGroups<
  T extends { id: number; name: string; manufacturer: string | null; poolType: string }
>(items: T[], opts: Options<T>): GearSearchGroup<T>[] {
  const byKey = new Map<string, T[]>()
  for (const item of items) {
    const key = gearIdentityKey(item.name, item.manufacturer)
    const list = byKey.get(key)
    if (list) list.push(item)
    else byKey.set(key, [item])
  }

  const groups: GearSearchGroup<T>[] = []
  for (const [key, membersRaw] of byKey) {
    const members = [...membersRaw].sort((a, b) => precedenceOf(a.poolType) - precedenceOf(b.poolType))
    const first = members[0]
    const pick = members.find((m) => !opts.isFull(m)) ?? first
    const pools = [...new Set(members.map(opts.poolLabel))]
    groups.push({
      key,
      label: formatGearLabel(first.name, first.manufacturer),
      hint: pools.length > 1 ? pools.join(' + ') : undefined,
      used: members.reduce((n, m) => n + opts.usedByOthers(m), 0),
      capacity: members.reduce((n, m) => n + opts.capacity(m), 0),
      disabled: members.every((m) => opts.isFull(m)),
      pick,
      memberIds: members.map((m) => m.id)
    })
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label))
}
