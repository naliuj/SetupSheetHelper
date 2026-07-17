import { useCallback, useMemo } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import { useSetupStore } from '@renderer/state/setupStore'
import { useCatalogStore } from '@renderer/state/catalogStore'
import { useGearCatalogueSuggestions } from '@renderer/state/useGearCatalogueSuggestions'
import { computeTieLineConflicts } from '@renderer/state/tieLineConflicts'
import { computeUsageCounts, computeOutboardUsageCounts } from '@renderer/state/usageCounts'
import SetupSheetRow from './SetupSheetRow'

function toLabels(items: { name: string; manufacturer: string | null }[]): string[] {
  const set = new Set<string>()
  for (const item of items) set.add(item.manufacturer ? `${item.manufacturer} ${item.name}` : item.name)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export default function SetupSheetTable(): JSX.Element {
  const items = useSetupStore((s) => s.items)
  const outboardColumnCount = useSetupStore((s) => s.outboardColumnCount)
  const visibleColumns = useSetupStore((s) => s.visibleColumns)
  const updateItemOutboardSlot = useSetupStore((s) => s.updateItemOutboardSlot)
  const selectedItemIds = useSetupStore((s) => s.selectedItemIds)
  const selectItem = useSetupStore((s) => s.selectItem)
  const selectRangeTo = useSetupStore((s) => s.selectRangeTo)
  const toggleItem = useSetupStore((s) => s.toggleItem)
  const reorderItems = useSetupStore((s) => s.reorderItems)
  const updateItemFields = useSetupStore((s) => s.updateItemFields)
  const removeItem = useSetupStore((s) => s.removeItem)
  const unresolvedGearHints = useSetupStore((s) => s.unresolvedGearHints)
  const clearUnresolvedGearHint = useSetupStore((s) => s.clearUnresolvedGearHint)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const col = useMemo(() => new Set(visibleColumns), [visibleColumns])

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Which rows move as one block, in priority order: a multi-selection (drag any selected row and
    // the whole selection travels together), otherwise a linked stereo pair (dragging either half
    // carries its partner so the two never separate). Anything else is a plain single-row move.
    let blockIds: Set<number | string> | null = null
    if (selectedItemIds.size > 1 && selectedItemIds.has(active.id)) {
      blockIds = selectedItemIds
    } else {
      const activeItem = items[oldIndex]
      if (activeItem.groupId != null) {
        const pair = items.filter((item) => item.groupId === activeItem.groupId)
        if (pair.length > 1) blockIds = new Set(pair.map((item) => item.id))
      }
    }

    if (blockIds) {
      if (blockIds.has(over.id)) return // dropped within the same block — no-op
      const block = items.filter((item) => blockIds!.has(item.id))
      const others = items.filter((item) => !blockIds!.has(item.id))
      const overIndexInOthers = others.findIndex((item) => item.id === over.id)
      const insertAt = newIndex > oldIndex ? overIndexInOthers + 1 : overIndexInOthers
      const reordered = [...others.slice(0, insertAt), ...block, ...others.slice(insertAt)]
      reorderItems(reordered.map((item) => item.id))
      return
    }

    reorderItems(arrayMove(items, oldIndex, newIndex).map((item) => item.id))
  }

  // Stable identity (deps are all stable store actions) so memoized rows aren't re-rendered
  // just because the table re-rendered.
  const handleGutterClick = useCallback(
    (e: React.MouseEvent, itemId: number | string): void => {
      if (e.shiftKey) selectRangeTo(itemId)
      else if (e.ctrlKey || e.metaKey) toggleItem(itemId)
      else selectItem(itemId)
    },
    [selectRangeTo, toggleItem, selectItem]
  )

  // Toggles a mic-group link on the seam *below* `itemId` — i.e. links `itemId`'s row with the one
  // directly beneath it, whatever position they're at (no odd/even bucket). Reads the freshest
  // store state at click time via getState() rather than closing over `items`/`mics` props, so this
  // callback can have a permanently stable identity (empty deps) without going stale — otherwise
  // every row would lose memoization on every edit, since this function would need to be recreated
  // whenever `items` changes (i.e. on every keystroke).
  const handleTogglePairLink = useCallback((itemId: number | string): void => {
    const state = useSetupStore.getState()
    const currentItems = state.items
    const idx = currentItems.findIndex((i) => i.id === itemId)
    if (idx === -1) return
    const topItem = currentItems[idx]
    const bottomItem = currentItems[idx + 1]
    if (!topItem || !bottomItem) return

    const linked = topItem.groupId != null && topItem.groupId === bottomItem.groupId
    if (linked) {
      state.updateItemFields(topItem.id, { groupId: null })
      state.updateItemFields(bottomItem.id, { groupId: null })
      return
    }

    // A row can only belong to one pair — before linking this seam, break any existing link the two
    // rows already have with their *other* neighbours (the row above `topItem`, or below
    // `bottomItem`), so linking (2,3) after (1,2) cleanly moves row 2 into the new pair.
    const above = currentItems[idx - 1]
    if (above && above.groupId != null && above.groupId === topItem.groupId) {
      state.updateItemFields(above.id, { groupId: null })
    }
    const below = currentItems[idx + 2]
    if (below && below.groupId != null && below.groupId === bottomItem.groupId) {
      state.updateItemFields(below.id, { groupId: null })
    }

    // Linking: the top row (first of the pair, by position) is always the "source" for one-time
    // auto-fill convenience.
    const groupId = crypto.randomUUID()
    const patch: Partial<SetupItemDraft> = { groupId }
    // Mic: only for a catalog mic with at least 2 units available (enough to cover both rows);
    // free-text mics carry over unconditionally since there's no quantity to check. Only fills the
    // bottom row's still-empty mic — separate from the ongoing sync that happens afterward when the
    // top row's mic changes (see SetupSheetRow's handleMicChange).
    if (bottomItem.micId == null && !bottomItem.micText) {
      if (topItem.micId != null) {
        const topMic = useCatalogStore.getState().mics.find((m) => m.id === topItem.micId)
        if (topMic && topMic.quantity >= 2) patch.micId = topItem.micId
      } else if (topItem.micText) {
        patch.micText = topItem.micText
      }
    }
    // Preamp: same quantity-gated pattern as mic (catalog preamps use `channels` as their
    // quantity), since a preamp is exactly as gear-constrained as a mic — only fills the bottom
    // row's still-empty preamp.
    if (bottomItem.preampId == null && !bottomItem.preampText) {
      if (topItem.preampId != null) {
        const topPreamp = useCatalogStore.getState().preamps.find((p) => p.id === topItem.preampId)
        if (topPreamp && topPreamp.channels >= 2) patch.preampId = topItem.preampId
      } else if (topItem.preampText) {
        patch.preampText = topItem.preampText
      }
    }
    // 48V and outboard: simple mirror of the top row, no quantity gating (unlike mic/preamp) —
    // only when the bottom row hasn't already got its own outboard picks.
    patch.phantomPower = topItem.phantomPower
    if (bottomItem.outboards.length === 0 && topItem.outboards.length > 0) {
      patch.outboards = topItem.outboards.map((slot) => ({ ...slot }))
    }
    state.updateItemFields(topItem.id, { groupId })
    state.updateItemFields(bottomItem.id, patch)
  }, [])

  // Ongoing sync (separate from the one-time auto-fill above): once a pair is linked, changing
  // either row's mic to a catalog mic with at least 2 units available propagates the same mic to
  // its partner too, keeping a stereo pair on matched mics without manual re-entry. Clearing a
  // row's mic (picking "No Mic") always propagates too — resetting isn't subject to the quantity
  // gate, since there's nothing to run out of. Fires from either row of an actively-linked pair
  // (see SetupSheetRow's handleMicChange) — editing either side updates the other.
  const handleSyncPairMic = useCallback((itemId: number | string, micId: number | null): void => {
    const state = useSetupStore.getState()
    const found = findLinkedPartner(state, itemId)
    if (!found) return
    if (micId == null) {
      state.updateItemFields(found.partner.id, { micId: null, micText: null })
      return
    }
    const mic = useCatalogStore.getState().mics.find((m) => m.id === micId)
    if (!mic || mic.quantity < 2) return
    state.updateItemFields(found.partner.id, { micId, micText: null })
  }, [])

  // Same ongoing sync as handleSyncPairMic, for preamp (catalog preamps use `channels` as their
  // quantity — same idea as mic's `quantity`).
  const handleSyncPairPreamp = useCallback((itemId: number | string, preampId: number | null): void => {
    const state = useSetupStore.getState()
    const found = findLinkedPartner(state, itemId)
    if (!found) return
    if (preampId == null) {
      state.updateItemFields(found.partner.id, { preampId: null, preampText: null })
      return
    }
    const preamp = useCatalogStore.getState().preamps.find((p) => p.id === preampId)
    if (!preamp || preamp.channels < 2) return
    state.updateItemFields(found.partner.id, { preampId, preampText: null })
  }, [])

  /** Shared "is this row part of an actively-linked pair, and who's its partner" check, reused by
   *  every ongoing-sync handler below. A row's partner is whichever *adjacent* neighbour (the row
   *  directly above or below) shares its non-null groupId — no odd/even position rule. A row can
   *  only be linked to one neighbour (enforced in handleTogglePairLink), so at most one side
   *  matches. Works from EITHER row of the pair (editing either side updates the other), unlike the
   *  one-time link-time auto-fill which always seeds bottom from top. `direction` is +1 when the
   *  partner is below `itemId` and -1 when it's above — used to keep numeric fields like channel
   *  offsetting the right way regardless of which row triggered the sync. */
  function findLinkedPartner(
    state: ReturnType<typeof useSetupStore.getState>,
    itemId: number | string
  ): { partner: SetupItemDraft; direction: 1 | -1 } | null {
    const currentItems = state.items
    const idx = currentItems.findIndex((i) => i.id === itemId)
    if (idx === -1) return null
    const item = currentItems[idx]
    if (item.groupId == null) return null
    const below = currentItems[idx + 1]
    if (below && below.groupId === item.groupId) return { partner: below, direction: 1 }
    const above = currentItems[idx - 1]
    if (above && above.groupId === item.groupId) return { partner: above, direction: -1 }
    return null
  }

  // Ongoing sync for 48V, polarity, channel, tie line, and cue box: editing any of these on either
  // row of an actively-linked pair pushes the change to its partner. 48V and polarity copy straight
  // across; the numeric fields carry the "N / N+1" stereo-pair convention forward (channel 3 →
  // partner becomes 4, or the reverse if edited from the bottom row) rather than duplicating the
  // exact number, since two rows can't share one channel/tie line/cue box — clamped to a minimum of
  // 1 either way. Only whichever keys are actually present in `patch` get synced.
  const handleSyncPairFields = useCallback((itemId: number | string, patch: Partial<SetupItemDraft>): void => {
    const state = useSetupStore.getState()
    const found = findLinkedPartner(state, itemId)
    if (!found) return
    const { partner, direction } = found
    const syncPatch: Partial<SetupItemDraft> = {}
    if ('phantomPower' in patch) syncPatch.phantomPower = patch.phantomPower
    if ('polarityFlip' in patch) syncPatch.polarityFlip = patch.polarityFlip
    if ('channel' in patch && patch.channel != null) syncPatch.channel = Math.max(1, patch.channel + direction)
    if ('tieLine' in patch && patch.tieLine != null) syncPatch.tieLine = Math.max(1, patch.tieLine + direction)
    if ('cueBox' in patch && patch.cueBox != null) syncPatch.cueBox = Math.max(1, patch.cueBox + direction)
    if (Object.keys(syncPatch).length > 0) state.updateItemFields(partner.id, syncPatch)
  }, [])

  // Ongoing sync for outboard: editing an outboard slot on either row of an actively-linked pair
  // mirrors the same slot on its partner.
  const handleSyncPairOutboardSlot = useCallback(
    (itemId: number | string, slotIndex: number, patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>): void => {
      const state = useSetupStore.getState()
      const found = findLinkedPartner(state, itemId)
      if (!found) return
      state.updateItemOutboardSlot(found.partner.id, slotIndex, patch)
    },
    []
  )

  const mics = useCatalogStore((s) => s.mics)
  const outboardGear = useCatalogStore((s) => s.outboardGear)
  const preamps = useCatalogStore((s) => s.preamps)
  const isTemporary = useCatalogStore((s) => s.isTemporary)

  // Quick Setup's free-text mic/outboard/preamp fields have no studio catalogue to pick
  // from, so they get autocomplete suggestions from every known model across every studio
  // instead — same source data Personal Gear/Faculty Reserve/Session Gear's forms use.
  const gearSuggestions = useGearCatalogueSuggestions()
  const micSuggestions = useMemo(() => toLabels(gearSuggestions.mics), [gearSuggestions.mics])
  const outboardSuggestions = useMemo(() => toLabels(gearSuggestions.outboard), [gearSuggestions.outboard])
  const preampSuggestions = useMemo(() => toLabels(gearSuggestions.preamps), [gearSuggestions.preamps])

  // Memoized on items: these are O(rows) and produce fresh Map identities, so recomputing
  // them on unrelated re-renders (selection, hints, catalog loads) both wasted the work and
  // broke SetupSheetRow's memoization.
  const conflicts = useMemo(() => computeTieLineConflicts(items), [items])
  const micUsageCounts = useMemo(() => computeUsageCounts(items, 'micId'), [items])
  const outboardUsageCounts = useMemo(() => computeOutboardUsageCounts(items), [items])
  const preampUsageCounts = useMemo(() => computeUsageCounts(items, 'preampId'), [items])
  const sortableIds = useMemo(() => items.map((item) => item.id), [items])

  // Per-row link state, derived by adjacency (no odd/even bucket). Every row except the last hosts
  // a link button on its bottom seam (`hasSeamBelow`), so any adjacent pair can be linked wherever
  // it sits. `bracket` is 'top' when this row shares its groupId with the row below, 'bottom' when
  // it shares with the row above — that's what draws the accent bracket around a linked pair.
  // `seamZIndex` descends with row order so each row's seam button (which straddles the border into
  // the row below) paints above — and stays clickable over — that next row's gutter cell. Cheap
  // enough to derive per-render without memoizing, since it's a single array walk.
  const rowLinkState: { hasSeamBelow: boolean; bracket: 'top' | 'bottom' | null; seamZIndex: number }[] = items.map(
    (item, i) => {
      const below = items[i + 1]
      const above = items[i - 1]
      let bracket: 'top' | 'bottom' | null = null
      if (item.groupId != null && below && below.groupId === item.groupId) bracket = 'top'
      else if (item.groupId != null && above && above.groupId === item.groupId) bracket = 'bottom'
      return { hasSeamBelow: i < items.length - 1, bracket, seamZIndex: items.length - i }
    }
  )

  return (
    <div style={{ padding: 12 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Setup sheet
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          No sources yet — use Add source above, or switch to Layout Mode to drag instruments onto the room layout.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <table className="data-table">
            <thead>
              <tr>
                {col.has('stereoLink') && <th aria-label="Stereo pair link" style={{ width: 20 }}></th>}
                <th></th>
                <th>Source name</th>
                {col.has('mic') && <th>Mic</th>}
                {col.has('phantomPower') && <th>48V</th>}
                {col.has('outboard') &&
                  Array.from({ length: outboardColumnCount }, (_, i) => (
                    <th key={i}>{i === 0 ? 'Outboard' : `Outboard ${i + 1}`}</th>
                  ))}
                {col.has('channel') && <th>Channel</th>}
                {col.has('preamp') && <th>Preamp</th>}
                {col.has('tieLine') && <th>Tie line</th>}
                {col.has('cueBox') && <th>Cue box</th>}
                {col.has('polarity') && <th>Polarity</th>}
                {col.has('notes') && <th>Notes</th>}
                <th></th>
              </tr>
            </thead>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {items.map((item, i) => (
                  <SetupSheetRow
                    key={item.id}
                    item={item}
                    mics={mics}
                    outboardGear={outboardGear}
                    preamps={preamps}
                    outboardColumnCount={outboardColumnCount}
                    visibleColumns={col}
                    isTemporary={isTemporary}
                    micSuggestions={micSuggestions}
                    outboardSuggestions={outboardSuggestions}
                    preampSuggestions={preampSuggestions}
                    selected={selectedItemIds.has(item.id)}
                    hasSeamBelow={rowLinkState[i].hasSeamBelow}
                    bracket={rowLinkState[i].bracket}
                    seamZIndex={rowLinkState[i].seamZIndex}
                    onTogglePairLink={handleTogglePairLink}
                    onSyncPairMic={handleSyncPairMic}
                    onSyncPairPreamp={handleSyncPairPreamp}
                    onSyncPairFields={handleSyncPairFields}
                    onSyncPairOutboardSlot={handleSyncPairOutboardSlot}
                    conflict={item.tieLine != null && conflicts.has(item.tieLine)}
                    unresolvedGearHint={unresolvedGearHints.get(item.id)}
                    onClearUnresolvedGearHint={clearUnresolvedGearHint}
                    micUsageCounts={micUsageCounts}
                    outboardUsageCounts={outboardUsageCounts}
                    preampUsageCounts={preampUsageCounts}
                    onGutterClick={handleGutterClick}
                    onChange={updateItemFields}
                    onOutboardSlotChange={updateItemOutboardSlot}
                    onDelete={removeItem}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      )}
    </div>
  )
}
