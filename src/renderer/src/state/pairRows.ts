/** Row-list rules that keep linked stereo pairs intact. A pair is two ADJACENT rows sharing a
 *  non-null groupId, so anything that inserts rows has to avoid landing between the two halves.
 *  Pure functions, so scripts/check_pair_rows.mjs can test them without the store. */

interface PairRow {
  id: number | string
  groupId: string | null
}

/** Copies of the listed rows. Each contiguous run of selected rows is copied as a block right
 *  after the run, never between a pair's halves. A pair copied whole becomes a new pair (one fresh
 *  groupId per source pair, as applyChannelPreset does); a lone half comes out unlinked. Returns
 *  the new list and the copies' ids, in order. */
export function duplicateRows<T extends PairRow>(
  items: T[],
  ids: Iterable<number | string>,
  copy: (item: T, groupId: string | null) => T,
  newGroupId: () => string
): { items: T[]; copyIds: Array<number | string> } {
  const idSet = new Set(ids)
  const selectedPerGroup = new Map<string, number>()
  for (const item of items) {
    if (idSet.has(item.id) && item.groupId != null) {
      selectedPerGroup.set(item.groupId, (selectedPerGroup.get(item.groupId) ?? 0) + 1)
    }
  }
  const freshGroupIds = new Map<string, string>()
  const copyOf = (item: T): T => {
    let groupId: string | null = null
    if (item.groupId != null && (selectedPerGroup.get(item.groupId) ?? 0) >= 2) {
      groupId = freshGroupIds.get(item.groupId) ?? newGroupId()
      freshGroupIds.set(item.groupId, groupId)
    }
    return copy(item, groupId)
  }

  const next: T[] = []
  const copyIds: Array<number | string> = []
  let pending: T[] = []
  items.forEach((item, index) => {
    next.push(item)
    if (idSet.has(item.id)) pending.push(copyOf(item))
    const after = items[index + 1]
    const runContinues = after != null && idSet.has(after.id)
    const splitsPair = after != null && item.groupId != null && after.groupId === item.groupId
    if (pending.length > 0 && !runContinues && !splitsPair) {
      for (const c of pending) {
        next.push(c)
        copyIds.push(c.id)
      }
      pending = []
    }
  })
  return { items: next, copyIds }
}

/** After a drag, moves the dropped rows (contiguous in `order`) past a pair they landed inside:
 *  below its second half when the drag went down, above its first half when it went up. */
export function avoidSplittingPair<T extends PairRow>(
  order: T[],
  movedIds: Set<number | string>,
  movingDown: boolean
): T[] {
  const start = order.findIndex((item) => movedIds.has(item.id))
  if (start === -1) return order
  let end = start
  while (end + 1 < order.length && movedIds.has(order[end + 1].id)) end++
  const before = order[start - 1]
  const after = order[end + 1]
  if (!before || !after || before.groupId == null || before.groupId !== after.groupId) return order

  const block = order.slice(start, end + 1)
  const rest = [...order.slice(0, start), ...order.slice(end + 1)]
  // `before` sits at start - 1 in `rest`, its partner `after` right behind it.
  const insertAt = movingDown ? start + 1 : start - 1
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
}
