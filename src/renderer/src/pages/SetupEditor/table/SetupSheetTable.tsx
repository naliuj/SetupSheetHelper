import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react'
import { STEREO_LANE_WIDTH } from '@shared/constants/stereoBrace'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { onDragOverTick, useSortableSensors } from '@renderer/hooks/useSortableSensors'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import { COLUMN_LABELS, orderedVisibleColumns } from '@shared/constants/setupColumns'
import { useSetupStoreApi, useSetupStoreState } from '@renderer/state/setupStoreContext'
import { useCatalogStoreApi, useCatalogStoreState } from '@renderer/state/catalogStoreContext'
import { useGearCatalogueSuggestions } from '@renderer/state/useGearCatalogueSuggestions'
import { computeTieLineConflicts } from '@renderer/state/tieLineConflicts'
import { offsetTieLine } from '@shared/utils/tieLine'
import { computeUsageCounts, buildGearUsage } from '@renderer/state/usageCounts'
import { formatGearLabel, gearIdentityKey, stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import type { Suggestion } from '@renderer/components/SuggestInput'
import SetupSheetRow, { SHEET_EDGE_INSET } from './SetupSheetRow'
import { GENERIC_INSTRUMENT_TYPE } from './tableConstants'
import { avoidSplittingPair } from '@shared/utils/pairRows'
import { bandIndexes, bandRanges, isBandDivider } from '@shared/utils/bands'
import BandDividerRow from './BandDividerRow'

/** Quick Setup's free-text suggestions. Two things this has to get right, both of which used to
 *  produce what looked like duplicate entries:
 *
 *  1. Gear names are inconsistent about embedding the manufacturer, so the seeded "API / API 2500"
 *     and a hand-added "API / 2500" are the same box — formatGearLabel renders both as "API 2500".
 *  2. The same model is stocked by many studios (an SM-57 exists in eight rows here), and spellings
 *     differ only in case ("U87 AI" vs "U87 Ai"), so identical entries have to collapse on a
 *     normalized key rather than on the exact string.
 *
 *  Punctuation variants ("KSM-27" vs "KSM27") deliberately do NOT collapse — those are genuine
 *  inconsistencies in the catalogue, and quietly merging them would hide a data problem instead of
 *  surfacing it. */
function toSuggestions(items: { name: string; manufacturer: string | null }[]): Suggestion[] {
  const byKey = new Map<string, Suggestion>()
  for (const item of items) {
    const key = gearIdentityKey(item.name, item.manufacturer)
    if (byKey.has(key)) continue
    byKey.set(key, {
      label: formatGearLabel(item.name, item.manufacturer),
      value: stripManufacturerPrefix(item.name, item.manufacturer ?? '')
    })
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export default function SetupSheetTable(): JSX.Element {
  const setupStoreApi = useSetupStoreApi()
  const catalogStoreApi = useCatalogStoreApi()
  const items = useSetupStoreState((s) => s.items)
  const addItem = useSetupStoreState((s) => s.addItem)
  const outboardColumnCount = useSetupStoreState((s) => s.outboardColumnCount)
  const visibleColumns = useSetupStoreState((s) => s.visibleColumns)
  const columnOrder = useSetupStoreState((s) => s.columnOrder)
  const updateItemOutboardSlot = useSetupStoreState((s) => s.updateItemOutboardSlot)
  const selectedItemIds = useSetupStoreState((s) => s.selectedItemIds)
  const selectItem = useSetupStoreState((s) => s.selectItem)
  const selectRangeTo = useSetupStoreState((s) => s.selectRangeTo)
  const toggleItem = useSetupStoreState((s) => s.toggleItem)
  const reorderItems = useSetupStoreState((s) => s.reorderItems)
  const updateItemFields = useSetupStoreState((s) => s.updateItemFields)
  const removeItem = useSetupStoreState((s) => s.removeItem)
  const unresolvedGearHints = useSetupStoreState((s) => s.unresolvedGearHints)
  const clearUnresolvedGearHint = useSetupStoreState((s) => s.clearUnresolvedGearHint)
  const collapsedBands = useSetupStoreState((s) => s.collapsedBands)
  const focusedBand = useSetupStoreState((s) => s.focusedBand)
  const setFocusedBand = useSetupStoreState((s) => s.setFocusedBand)
  const bandScrollRequest = useSetupStoreState((s) => s.bandScrollRequest)
  const tableRef = useRef<HTMLTableElement>(null)

  const sensors = useSortableSensors()
  // Derived once here, not per row: every memoized SetupSheetRow gets these same two references,
  // so a re-render caused by anything else still bails out of re-rendering the rows. `stereoLink`
  // is split out because it's pinned leftmost rather than part of the reorderable run.
  const showStereoLink = visibleColumns.includes('stereoLink')
  const orderedColumns = useMemo(
    () => orderedVisibleColumns(columnOrder, visibleColumns).filter((k) => k !== 'stereoLink'),
    [columnOrder, visibleColumns]
  )

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
      reorderItems(avoidSplittingPair(reordered, blockIds, newIndex > oldIndex).map((item) => item.id))
      return
    }

    const moved = avoidSplittingPair(arrayMove(items, oldIndex, newIndex), new Set([active.id]), newIndex > oldIndex)
    reorderItems(moved.map((item) => item.id))
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

  // Arrow-key navigation for the gutter select buttons. Reads the freshest store state via
  // getState() rather than closing over `items`, for the same reason handleTogglePairLink does:
  // a stable identity (empty deps) is what keeps every memoized row from re-rendering on each
  // keystroke.
  //
  // Plain arrows walk focus without changing the selection; Shift+arrow extends to the neighbor,
  // matching shift-click. selectRangeTo already falls back to a plain select when there is no
  // anchor yet, so an unselected sheet needs no special case here.
  const handleGutterKeyDown = useCallback((e: React.KeyboardEvent, itemId: number | string): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const state = setupStoreApi.getState()
    const idx = state.items.findIndex((i) => i.id === itemId)
    if (idx === -1) return
    // Band divider rows have no select button; step over them to the next real row.
    const step = e.key === 'ArrowDown' ? 1 : -1
    let n = idx + step
    while (state.items[n] && isBandDivider(state.items[n])) n += step
    const neighbor = state.items[n]
    if (!neighbor) return
    // Only now — an arrow at either end should stay an ordinary arrow, not a swallowed one.
    e.preventDefault()
    if (e.shiftKey) state.selectRangeTo(neighbor.id)
    let nextRow = (e.currentTarget as HTMLElement).closest('tr')
    do {
      nextRow = (step === 1 ? nextRow?.nextElementSibling : nextRow?.previousElementSibling) as HTMLTableRowElement | null
    } while (nextRow && !nextRow.querySelector('.gutter-select'))
    nextRow?.querySelector<HTMLButtonElement>('.gutter-select')?.focus()
  }, [])

  // Toggles a mic-group link on the seam *below* `itemId` — i.e. links `itemId`'s row with the one
  // directly beneath it, whatever position they're at (no odd/even bucket). Reads the freshest
  // store state at click time via getState() rather than closing over `items`/`mics` props, so this
  // callback can have a permanently stable identity (empty deps) without going stale — otherwise
  // every row would lose memoization on every edit, since this function would need to be recreated
  // whenever `items` changes (i.e. on every keystroke).
  const handleTogglePairLink = useCallback((itemId: number | string): void => {
    const state = setupStoreApi.getState()
    const currentItems = state.items
    const idx = currentItems.findIndex((i) => i.id === itemId)
    if (idx === -1) return
    const topItem = currentItems[idx]
    const bottomItem = currentItems[idx + 1]
    if (!topItem || !bottomItem) return

    const linked = topItem.groupId != null && topItem.groupId === bottomItem.groupId
    if (linked) {
      state.updateItemsFields(
        new Map([
          [topItem.id, { groupId: null }],
          [bottomItem.id, { groupId: null }]
        ])
      )
      return
    }
    // Every row this link touches, applied in one set() so it's one undo step.
    const patches = new Map<number | string, Partial<SetupItemDraft>>()

    // A row can only belong to one pair — before linking this seam, break any existing link the two
    // rows already have with their *other* neighbors (the row above `topItem`, or below
    // `bottomItem`), so linking (2,3) after (1,2) cleanly moves row 2 into the new pair.
    const above = currentItems[idx - 1]
    if (above && above.groupId != null && above.groupId === topItem.groupId) {
      patches.set(above.id, { groupId: null })
    }
    const below = currentItems[idx + 2]
    if (below && below.groupId != null && below.groupId === bottomItem.groupId) {
      patches.set(below.id, { groupId: null })
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
        const topMic = catalogStoreApi.getState().mics.find((m) => m.id === topItem.micId)
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
        const topPreamp = catalogStoreApi.getState().preamps.find((p) => p.id === topItem.preampId)
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
    patches.set(topItem.id, { groupId })
    patches.set(bottomItem.id, patch)
    state.updateItemsFields(patches)
  }, [])

  // Ongoing sync (separate from the one-time auto-fill above): once a pair is linked, changing
  // either row's mic to a catalog mic with at least 2 units available propagates the same mic to
  // its partner too, keeping a stereo pair on matched mics without manual re-entry. Clearing a
  // row's mic (picking "No Mic") always propagates too — resetting isn't subject to the quantity
  // gate, since there's nothing to run out of. Fires from either row of an actively-linked pair
  // (see SetupSheetRow's handleMicChange) — editing either side updates the other. A partner that
  // takes the change also drops its "missing from this studio" flag, same as the edited row does.
  const handleSyncPairMic = useCallback((itemId: number | string, micId: number | null): void => {
    const state = setupStoreApi.getState()
    const found = findLinkedPartner(state, itemId)
    if (!found) return
    if (micId == null) {
      state.updateItemFields(found.partner.id, { micId: null, micText: null })
      state.clearUnresolvedGearHint(found.partner.id, 'mic')
      return
    }
    const mic = catalogStoreApi.getState().mics.find((m) => m.id === micId)
    if (!mic || mic.quantity < 2) return
    state.updateItemFields(found.partner.id, { micId, micText: null })
    state.clearUnresolvedGearHint(found.partner.id, 'mic')
  }, [])

  // Same ongoing sync as handleSyncPairMic, for preamp (catalog preamps use `channels` as their
  // quantity — same idea as mic's `quantity`).
  const handleSyncPairPreamp = useCallback((itemId: number | string, preampId: number | null): void => {
    const state = setupStoreApi.getState()
    const found = findLinkedPartner(state, itemId)
    if (!found) return
    if (preampId == null) {
      state.updateItemFields(found.partner.id, { preampId: null, preampText: null })
      state.clearUnresolvedGearHint(found.partner.id, 'preamp')
      return
    }
    const preamp = catalogStoreApi.getState().preamps.find((p) => p.id === preampId)
    if (!preamp || preamp.channels < 2) return
    state.updateItemFields(found.partner.id, { preampId, preampText: null })
    state.clearUnresolvedGearHint(found.partner.id, 'preamp')
  }, [])

  /** Shared "is this row part of an actively-linked pair, and who's its partner" check, reused by
   *  every ongoing-sync handler below. A row's partner is whichever *adjacent* neighbor (the row
   *  directly above or below) shares its non-null groupId — no odd/even position rule. A row can
   *  only be linked to one neighbor (enforced in handleTogglePairLink), so at most one side
   *  matches. Works from EITHER row of the pair (editing either side updates the other), unlike the
   *  one-time link-time auto-fill which always seeds bottom from top. `direction` is +1 when the
   *  partner is below `itemId` and -1 when it's above — used to keep numeric fields like channel
   *  offsetting the right way regardless of which row triggered the sync. */
  function findLinkedPartner(
    state: ReturnType<ReturnType<typeof useSetupStoreApi>['getState']>,
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
  // across; channel/tie line carry the "N / N+1" stereo-pair convention forward (channel 3 →
  // partner becomes 4, or the reverse if edited from the bottom row) rather than duplicating the
  // exact number, since two rows can't share one channel/tie line — clamped to a minimum of 1
  // either way. Tie line is free text, so it steps its trailing number ("PB1" → "PB2") and leaves
  // the partner alone when there isn't one. Cue box is free text: a plain integer keeps that N/N+1 convention, but anything
  // else — most importantly a stereo cue like "1-2", which the pair genuinely SHARES on the
  // console — copies verbatim. Only whichever keys are actually present in `patch` get synced.
  const handleSyncPairFields = useCallback((itemId: number | string, patch: Partial<SetupItemDraft>): void => {
    const state = setupStoreApi.getState()
    const found = findLinkedPartner(state, itemId)
    if (!found) return
    const { partner, direction } = found
    const syncPatch: Partial<SetupItemDraft> = {}
    if ('phantomPower' in patch) syncPatch.phantomPower = patch.phantomPower
    if ('polarityFlip' in patch) syncPatch.polarityFlip = patch.polarityFlip
    if ('channel' in patch && patch.channel != null) syncPatch.channel = Math.max(1, patch.channel + direction)
    if ('tieLine' in patch && patch.tieLine != null) {
      const partnerTieLine = offsetTieLine(patch.tieLine, direction)
      if (partnerTieLine != null) syncPatch.tieLine = partnerTieLine
    }
    if ('cueBox' in patch && patch.cueBox != null) {
      syncPatch.cueBox = /^\d+$/.test(patch.cueBox)
        ? String(Math.max(1, Number(patch.cueBox) + direction))
        : patch.cueBox
    }
    if (Object.keys(syncPatch).length > 0) state.updateItemFields(partner.id, syncPatch)
  }, [])

  // Ongoing sync for outboard: editing an outboard slot on either row of an actively-linked pair
  // mirrors the same slot on its partner.
  const handleSyncPairOutboardSlot = useCallback(
    (itemId: number | string, slotIndex: number, patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>): void => {
      const state = setupStoreApi.getState()
      const found = findLinkedPartner(state, itemId)
      if (!found) return
      state.updateItemOutboardSlot(found.partner.id, slotIndex, patch)
      if ('outboardId' in patch) state.clearUnresolvedGearHint(found.partner.id, 'outboard')
    },
    []
  )

  const mics = useCatalogStoreState((s) => s.mics)
  const outboardGear = useCatalogStoreState((s) => s.outboardGear)
  const preamps = useCatalogStoreState((s) => s.preamps)
  const isTemporary = useCatalogStoreState((s) => s.isTemporary)

  // Quick Setup's free-text mic/outboard/preamp fields have no studio catalogue to pick
  // from, so they get autocomplete suggestions from every known model across every studio
  // instead — same source data Personal Gear/Faculty Reserve/Session Gear's forms use.
  const gearSuggestions = useGearCatalogueSuggestions()
  const micSuggestions = useMemo(() => toSuggestions(gearSuggestions.mics), [gearSuggestions.mics])
  const outboardSuggestions = useMemo(() => toSuggestions(gearSuggestions.outboard), [gearSuggestions.outboard])
  const preampSuggestions = useMemo(() => toSuggestions(gearSuggestions.preamps), [gearSuggestions.preamps])

  // Memoized on items: these are O(rows) and produce fresh Map identities, so recomputing
  // them on unrelated re-renders (selection, hints, catalog loads) both wasted the work and
  // broke SetupSheetRow's memoization.
  //
  // All three are counted per band: bands play one after another, so the same mic, outboard unit
  // and tie line are meant to be reused across them. A sheet without dividers is one band.
  const bands = useMemo(() => bandRanges(items), [items])
  const bandOf = useMemo(() => bandIndexes(items), [items])
  const bandSlices = useMemo(() => bands.map((r) => items.slice(r.start, r.end)), [bands, items])
  const conflictIds = useMemo(() => {
    const ids = new Set<number | string>()
    for (const slice of bandSlices) for (const group of computeTieLineConflicts(slice).values()) group.forEach((id) => ids.add(id))
    return ids
  }, [bandSlices])
  const micUsageByBand = useMemo(() => bandSlices.map((slice) => computeUsageCounts(slice, 'micId')), [bandSlices])
  // Outboard and preamp capacity are accounted for together: a few units (the UA 6176, the
  // Millennia STT-1) are in both catalogs on purpose, being a preamp AND a compressor. See
  // buildGearUsage — it shares one pool across rows while still letting a single box be both the
  // preamp and the compressor on the SAME row.
  const gearUsageByBand = useMemo(
    () => bandSlices.map((slice) => buildGearUsage(slice, outboardGear, preamps)),
    [bandSlices, outboardGear, preamps]
  )

  // Which rows are on screen: a focused band shows alone, and a folded band shows only its divider.
  const visible = useMemo(
    () =>
      items.map((item, i) => {
        const band = bandOf[i]
        if (focusedBand != null && band !== focusedBand) return false
        return isBandDivider(item) || !collapsedBands.has(band)
      }),
    [items, bandOf, focusedBand, collapsedBands]
  )
  const sortableIds = useMemo(() => items.filter((_, i) => visible[i]).map((item) => item.id), [items, visible])
  const columnCount =
    (showStereoLink ? 1 : 0) +
    1 +
    orderedColumns.reduce((n, key) => n + (key === 'outboard' ? outboardColumnCount : 1), 0) +
    1

  // The toolbar's Bands menu asks for a band by number; scroll its divider into view here, where the
  // table element is (each Split View pane has its own table and store).
  useEffect(() => {
    if (!bandScrollRequest) return
    const state = setupStoreApi.getState()
    if (state.focusedBand != null && state.focusedBand !== bandScrollRequest.band) state.setFocusedBand(null)
    requestAnimationFrame(() => {
      tableRef.current
        ?.querySelector(`tr[data-band-index="${bandScrollRequest.band}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }, [bandScrollRequest])

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
      // No link seam next to a band divider: a pair never spans two bands.
      const hasSeamBelow = below != null && !isBandDivider(item) && !isBandDivider(below)
      return { hasSeamBelow, bracket, seamZIndex: items.length - i }
    }
  )

  // Double-clicking blank page space (below/around the table, or the empty-state message when
  // there are no rows yet) adds a row the same way the toolbar's "Add source" button does with an
  // empty name field. Gated on `e.target === e.currentTarget` so a double-click on the table
  // itself (a row, a cell, an input) doesn't bubble up and add an unwanted row — only genuinely
  // blank space triggers it.
  function handleBlankAreaDoubleClick(e: React.MouseEvent): void {
    if (e.target !== e.currentTarget) return
    addItem(GENERIC_INSTRUMENT_TYPE)
  }

  return (
    <div style={{ padding: SHEET_EDGE_INSET, height: '100%', boxSizing: 'border-box' }} onDoubleClick={handleBlankAreaDoubleClick}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Setup sheet
      </div>
      {focusedBand != null && bands[focusedBand] && (
        <div className="band-focus-banner">
          Showing only {bands[focusedBand].divider?.sourceName.trim() || `Band ${focusedBand + 1}`}.
          <button className="btn small" onClick={() => setFocusedBand(null)}>
            Show all bands
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="empty-state" onDoubleClick={() => addItem(GENERIC_INSTRUMENT_TYPE)}>
          No sources yet — use Add source above, or switch to Layout Mode to drag instruments onto the room layout.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragOver={onDragOverTick} onDragEnd={handleDragEnd}>
          <table className="data-table" ref={tableRef}>
            <thead>
              <tr>
                {showStereoLink && <th scope="col" aria-label="Stereo pair link" style={{ width: STEREO_LANE_WIDTH }}></th>}
                {/* Named rather than left empty, following the stereo lane above: a blank header
                    leaves its whole column unannounced, and this one holds the row-select button
                    and drag handle. */}
                <th scope="col" aria-label="Select and reorder"></th>
                {orderedColumns.map((key) =>
                  key === 'outboard' ? (
                    <Fragment key={key}>
                      {Array.from({ length: outboardColumnCount }, (_, i) => (
                        <th scope="col" key={i}>{i === 0 ? 'Outboard' : `Outboard ${i + 1}`}</th>
                      ))}
                    </Fragment>
                  ) : (
                    <th scope="col" key={key}>{COLUMN_LABELS[key]}</th>
                  )
                )}
                <th scope="col" aria-label="Delete"></th>
              </tr>
            </thead>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {items.map((item, i) =>
                  !visible[i] ? null : isBandDivider(item) ? (
                    <BandDividerRow
                      key={item.rowKey ?? item.id}
                      item={item}
                      bandIndex={bandOf[i]}
                      bandCount={bands.length}
                      rowCount={bands[bandOf[i]].end - bands[bandOf[i]].start}
                      collapsed={collapsedBands.has(bandOf[i])}
                      colSpan={columnCount}
                      onChange={updateItemFields}
                    />
                  ) : (
                  <SetupSheetRow
                    key={item.rowKey ?? item.id}
                    item={item}
                    mics={mics}
                    outboardGear={outboardGear}
                    preamps={preamps}
                    outboardColumnCount={outboardColumnCount}
                    orderedColumns={orderedColumns}
                    showStereoLink={showStereoLink}
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
                    conflict={conflictIds.has(item.id)}
                    unresolvedGearHint={unresolvedGearHints.get(item.id)}
                    onClearUnresolvedGearHint={clearUnresolvedGearHint}
                    micUsageCounts={micUsageByBand[bandOf[i]]}
                    gearUsage={gearUsageByBand[bandOf[i]]}
                    onGutterClick={handleGutterClick}
                    onGutterKeyDown={handleGutterKeyDown}
                    rowNumber={i - bands[bandOf[i]].start + 1}
                    onChange={updateItemFields}
                    onOutboardSlotChange={updateItemOutboardSlot}
                    onDelete={removeItem}
                  />
                  )
                )}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      )}
    </div>
  )
}
