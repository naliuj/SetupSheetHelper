import { create } from 'zustand'
import { temporal } from 'zundo'
import type { SetupItemDraft, SetupItemOutboardSlot, SetupWithItems } from '@shared/types/setup'
import {
  ALL_COLUMN_KEYS,
  parseColumnOrder,
  type ExportColumnOverrides,
  type SetupColumnKey
} from '@shared/constants/setupColumns'
import { useColumnPrefsStore } from './columnPrefsStore'
import { useToastStore } from './toastStore'

export interface UnresolvedGearHint {
  mic?: string
  outboard?: string
  preamp?: string
}

/** A Channel Preset item after its mic/outboard name+manufacturer has been matched against
 *  the current studio's catalogue — unresolvedMicName/unresolvedOutboardName are set when no
 *  match was found, so the new row can carry a visible hint until the user picks a replacement.
 *  micName/outboardName (the raw captured text) are carried through regardless of whether they
 *  resolved, so Quick Setup's plain text fields (which never use micId/outboardId at all) still
 *  get populated with the gear's name. */
export interface ResolvedChannelPresetItem {
  instrumentType: string
  sourceName: string
  micId: number | null
  micName: string | null
  outboardId: number | null
  outboardName: string | null
  preampId: number | null
  preampName: string | null
  channel: number | null
  tieLine: number | null
  cueBox: string | null
  polarityFlip: boolean | null
  notes: string | null
  color: string | null
  unresolvedMicName?: string
  unresolvedOutboardName?: string
  unresolvedPreampName?: string
}

function newDraftId(): string {
  return crypto.randomUUID()
}

export interface NewItemDefaults {
  sourceName?: string
  micId?: number | null
  channel?: number | null
  notes?: string | null
}

interface SetupState {
  setupId: number | null
  studioId: number | null
  name: string
  sessionDate: string | null
  engineer: string | null
  artist: string | null
  /** Free-text session notes (tuning reference, mic-array spacing, or anything else). */
  sessionNotes: string | null
  folderId: number | null
  /** Off by default — students don't have access to faculty reserve gear. The sole gate for
   *  whether this setup can see it, regardless of which studio it belongs to. */
  facultyReserveEnabled: boolean
  items: SetupItemDraft[]
  /** How many "Outboard" columns the table currently shows — every row conceptually has this
   *  many slots (see SetupItemOutboardSlot), though a row may not have filled in every one. */
  outboardColumnCount: number
  /** Which toggleable columns this setup shows. Snapshotted from the global default on new setups;
   *  edited per-setup via the table toolbar's Columns popover. */
  visibleColumns: SetupColumnKey[]
  /** Left-to-right column order, covering every key (hidden ones included) so toggling a column off
   *  and back on doesn't lose its place. Pair with visibleColumns via orderedVisibleColumns(). */
  columnOrder: SetupColumnKey[]
  /** The user's explicit per-column export flips — only deviations from the computed default
   *  (visible in the editor AND used in ≥1 row → exported), so an untouched column keeps
   *  tracking the sheet's data. Shared by the PDF and spreadsheet export dialogs; see
   *  state/exportColumns.ts for the resolve logic. */
  exportColumnOverrides: ExportColumnOverrides
  /** Contiguous row selection (click = single, shift-click = range from the anchor). */
  selectedItemIds: Set<number | string>
  /** The last plain-clicked row — shift-click selects the range between it and the clicked row. */
  selectionAnchorId: number | string | null
  /** Bumped to ask the selection bar's inline numbering input to focus — lets the Cmd/Ctrl+Shift+N
   *  menu item drive the inline control instead of opening a modal. */
  numberingFocusTick: number
  /** Transient (not persisted) — set when a Channel Preset's captured mic/outboard couldn't be
   *  matched in the current studio's catalogue, cleared the moment the user picks a replacement. */
  unresolvedGearHints: Map<number | string, UnresolvedGearHint>
  isDirty: boolean
  isSaving: boolean

  startNewSetup(
    studioId: number,
    name: string,
    sessionDate: string | null,
    folderId?: number | null,
    engineer?: string | null,
    artist?: string | null
  ): void
  loadFromSetup(setup: SetupWithItems): void
  setName(name: string): void
  setSessionDate(date: string | null): void
  setEngineer(engineer: string | null): void
  setArtist(artist: string | null): void
  setSessionNotes(notes: string | null): void
  setFacultyReserveEnabled(enabled: boolean): void
  setColumnVisibility(key: SetupColumnKey, visible: boolean): void
  setColumnOrder(order: SetupColumnKey[]): void
  setExportColumnOverrides(overrides: ExportColumnOverrides): void
  resetColumnsToDefault(): void
  addItem(instrumentType: string, defaults?: NewItemDefaults): string
  addItemAt(instrumentType: string, defaults: NewItemDefaults): string
  updateItemFields(id: number | string, patch: Partial<SetupItemDraft>): void
  setItemsColor(ids: Array<number | string>, color: string | null): void
  updateItemOutboardSlot(
    id: number | string,
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ): void
  addOutboardColumn(): Promise<void>
  removeOutboardColumn(): Promise<void>
  removeItem(id: number | string): void
  removeItems(ids: Array<number | string>): void
  duplicateItems(ids: Array<number | string>): void
  reorderItems(orderedIds: Array<number | string>): void
  selectItem(id: number | string | null): void
  selectRangeTo(id: number | string): void
  toggleItem(id: number | string): void
  selectAll(): void
  clearSelection(): void
  applySequentialNumbering(field: 'channel' | 'tieLine' | 'cueBox', start: number): void
  focusNumbering(): void
  clearUnresolvedGearHint(id: number | string, field: 'mic' | 'outboard' | 'preamp'): void
  applyChannelPreset(items: ResolvedChannelPresetItem[]): void
  save(): Promise<void>
}

/** Builds one independent setup-store instance — its own data, dirty flag, autosave, and zundo
 *  undo stack. Exists as a factory (rather than a single `create()` call at module scope) so
 *  Split View can instantiate a second, fully independent instance for its right-hand pane; see
 *  setupStoreContext.tsx for how components resolve "which instance" without every consumer
 *  needing to be threaded a store prop. The methods below close over `store` (assigned right
 *  after `create()` returns, below) rather than the module singleton `useSetupStore`, so an
 *  instance's own undo/redo history is always the one it drives — not whichever instance
 *  happens to be the singleton. */
export function createSetupStore() {
  const store = create<SetupState>()(
  temporal(
    (set, get) => ({
      setupId: null,
  studioId: null,
  name: 'Untitled Setup',
  sessionDate: null,
  engineer: null,
  artist: null,
  sessionNotes: null,
  folderId: null,
  facultyReserveEnabled: false,
  items: [],
  outboardColumnCount: 1,
  visibleColumns: [...ALL_COLUMN_KEYS],
  columnOrder: [...ALL_COLUMN_KEYS],
  exportColumnOverrides: {},
  selectedItemIds: new Set<number | string>(),
  selectionAnchorId: null,
  numberingFocusTick: 0,
  unresolvedGearHints: new Map(),
  isDirty: false,
  isSaving: false,

  startNewSetup: (studioId, name, sessionDate, folderId = null, engineer = null, artist = null) => {
    store.temporal.getState().clear()
    set({
      setupId: null,
      studioId,
      name,
      sessionDate,
      engineer,
      artist,
      sessionNotes: null,
      folderId,
      facultyReserveEnabled: false,
      items: [],
      outboardColumnCount: 1,
      // Snapshot the current global default so a brand-new (still-unsaved) sheet renders the right
      // columns immediately; createSetup persists the same snapshot to the DB on first save.
      visibleColumns: [...useColumnPrefsStore.getState().defaultVisibleColumns],
      columnOrder: [...useColumnPrefsStore.getState().defaultColumnOrder],
      exportColumnOverrides: {},
      selectedItemIds: new Set(),
      selectionAnchorId: null,
      unresolvedGearHints: new Map(),
      isDirty: false
    })
  },

  loadFromSetup: (setup) => {
    store.temporal.getState().clear()
    set({
      setupId: setup.id,
      studioId: setup.studioId,
      name: setup.name,
      sessionDate: setup.sessionDate,
      engineer: setup.engineer,
      artist: setup.artist,
      sessionNotes: setup.sessionNotes,
      folderId: setup.folderId,
      facultyReserveEnabled: setup.facultyReserveEnabled,
      items: setup.items,
      outboardColumnCount: setup.outboardColumnCount,
      visibleColumns: setup.visibleColumns,
      columnOrder: setup.columnOrder,
      exportColumnOverrides: setup.exportColumnOverrides,
      selectedItemIds: new Set(),
      selectionAnchorId: null,
      unresolvedGearHints: new Map(),
      isDirty: false
    })
  },

  setName: (name) => set({ name, isDirty: true }),
  setSessionDate: (sessionDate) => set({ sessionDate, isDirty: true }),
  setEngineer: (engineer) => set({ engineer, isDirty: true }),
  setArtist: (artist) => set({ artist, isDirty: true }),
  setSessionNotes: (sessionNotes) => set({ sessionNotes, isDirty: true }),
  setFacultyReserveEnabled: (facultyReserveEnabled) => set({ facultyReserveEnabled, isDirty: true }),

  // Column visibility is per-setup. Persist immediately when the setup already exists (mirrors
  // setOutboardColumnCount); for a still-unsaved setup it rides along in save()'s create path.
  setColumnVisibility: (key, visible) => {
    const next = ALL_COLUMN_KEYS.filter((k) => (k === key ? visible : get().visibleColumns.includes(k)))
    set({ visibleColumns: next, isDirty: true })
    const { setupId } = get()
    if (setupId) void window.api.setups.setVisibleColumns(setupId, next)
  },

  // Order is stored per-setup alongside visibility, and covers every key (hidden included) so a
  // column re-shown later lands back where the user dragged it. Same write-through as above.
  setColumnOrder: (order) => {
    const next = parseColumnOrder(JSON.stringify(order))
    set({ columnOrder: next, isDirty: true })
    const { setupId } = get()
    if (setupId) void window.api.setups.setColumnOrder(setupId, next)
  },

  // Which columns land on an export, remembered per setup. Same write-through shape as the two
  // above (and re-asserted in save()). Deliberately does NOT set isDirty: flipping an export chip
  // isn't an edit to the sheet, and shouldn't make a just-saved setup look unsaved.
  setExportColumnOverrides: (overrides) => {
    set({ exportColumnOverrides: overrides })
    const { setupId } = get()
    if (setupId) void window.api.setups.setExportColumnOverrides(setupId, overrides)
  },

  resetColumnsToDefault: () => {
    const prefs = useColumnPrefsStore.getState()
    const next = [...prefs.defaultVisibleColumns]
    const nextOrder = [...prefs.defaultColumnOrder]
    set({ visibleColumns: next, columnOrder: nextOrder, isDirty: true })
    const { setupId } = get()
    if (setupId) {
      void window.api.setups.setVisibleColumns(setupId, next)
      void window.api.setups.setColumnOrder(setupId, nextOrder)
    }
  },

  addItem: (instrumentType, defaults) => get().addItemAt(instrumentType, defaults ?? {}),

  addItemAt: (instrumentType, defaults) => {
    const id = newDraftId()
    const draft: SetupItemDraft = {
      id,
      instrumentType,
      sourceName: defaults.sourceName ?? '',
      micId: defaults.micId ?? null,
      micText: null,
      phantomPower: false,
      channel: defaults.channel ?? null,
      tieLine: null,
      cueBox: null,
      outboards: [],
      preampId: null,
      preampText: null,
      polarityFlip: false,
      notes: defaults.notes ?? null,
      color: null,
      groupId: null
    }
    // Deliberately doesn't select the new row — auto-selecting made the SelectionActionBar pop
    // up on every add even though the user hadn't selected anything themselves.
    set((state) => ({
      items: [...state.items, draft],
      isDirty: true
    }))
    return id
  },

  updateItemFields: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      isDirty: true
    })),

  // Applies (or clears, with null) a row tint to every listed item at once — drives the
  // selection bar's Color control. Goes through the same zundo-tracked set() so it's undoable.
  setItemsColor: (ids, color) =>
    set((state) => {
      const idSet = new Set(ids)
      return {
        items: state.items.map((item) => (idSet.has(item.id) ? { ...item, color } : item)),
        isDirty: true
      }
    }),

  updateItemOutboardSlot: (id, slotIndex, patch) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== id) return item
        const existing = item.outboards.find((s) => s.slotIndex === slotIndex)
        const nextSlot: SetupItemOutboardSlot = {
          slotIndex,
          outboardId: existing?.outboardId ?? null,
          outboardText: existing?.outboardText ?? null,
          ...patch
        }
        const outboards = existing
          ? item.outboards.map((s) => (s.slotIndex === slotIndex ? nextSlot : s))
          : [...item.outboards, nextSlot]
        return { ...item, outboards }
      }),
      isDirty: true
    })),

  // Increments the sheet-wide outboard column count and persists it immediately (not deferred
  // to the next full save) — but a brand-new, never-saved setup has no id to persist against
  // yet, so the increment only lives in local state here; save()'s "create new setup" branch
  // pushes it at creation time in that case.
  addOutboardColumn: async () => {
    const state = get()
    const nextCount = state.outboardColumnCount + 1
    set({ outboardColumnCount: nextCount })
    if (state.setupId) {
      await window.api.setups.setOutboardColumnCount(state.setupId, nextCount)
    }
  },

  // Only ever removes the last (highest-index) column, clearing that slot's data from every
  // item at the same time — avoids leaving orphaned slot data that could silently reappear if a
  // column is added again later. Same immediate-persist-the-count/defer-the-rest split as
  // addOutboardColumn; the cleared item data flows through the normal isDirty -> save() path.
  removeOutboardColumn: async () => {
    const state = get()
    if (state.outboardColumnCount <= 1) return
    const removedIndex = state.outboardColumnCount - 1
    const nextCount = removedIndex
    set({
      outboardColumnCount: nextCount,
      items: state.items.map((item) => ({
        ...item,
        outboards: item.outboards.filter((s) => s.slotIndex !== removedIndex)
      })),
      isDirty: true
    })
    if (state.setupId) {
      await window.api.setups.setOutboardColumnCount(state.setupId, nextCount)
    }
  },

  removeItem: (id) => get().removeItems([id]),

  removeItems: (ids) => {
    set((state) => {
      const removing = new Set(ids)
      const selectedItemIds = new Set([...state.selectedItemIds].filter((id) => !removing.has(id)))
      return {
        items: state.items.filter((item) => !removing.has(item.id)),
        selectedItemIds,
        selectionAnchorId:
          state.selectionAnchorId != null && removing.has(state.selectionAnchorId) ? null : state.selectionAnchorId,
        isDirty: true
      }
    })
    if (ids.length > 0) {
      useToastStore
        .getState()
        .show(`Deleted ${ids.length} row${ids.length === 1 ? '' : 's'}`, () => store.temporal.getState().undo())
    }
  },

  // Duplicates every listed row in place (right after its original), mirroring layoutStore's
  // duplicateBlocks — selects the new copies afterward. Unlike blocks, rows have no x/y to
  // offset; position in the list is what "in place" means here.
  duplicateItems: (ids) =>
    set((state) => {
      const idSet = new Set(ids)
      const newSelected = new Set<number | string>()
      const nextItems: SetupItemDraft[] = []
      for (const item of state.items) {
        nextItems.push(item)
        if (idSet.has(item.id)) {
          const duplicate: SetupItemDraft = { ...item, id: newDraftId() }
          nextItems.push(duplicate)
          newSelected.add(duplicate.id)
        }
      }
      return { items: nextItems, selectedItemIds: newSelected, isDirty: true }
    }),

  selectItem: (id) =>
    set({ selectedItemIds: id != null ? new Set([id]) : new Set(), selectionAnchorId: id }),

  selectAll: () =>
    set((state) => ({
      selectedItemIds: new Set(state.items.map((item) => item.id)),
      selectionAnchorId: null
    })),

  clearSelection: () => set({ selectedItemIds: new Set(), selectionAnchorId: null }),

  // Ctrl/cmd-click: adds/removes exactly one row from the selection without disturbing the
  // rest, enabling non-contiguous selections alongside shift-click's contiguous ranges.
  toggleItem: (id) =>
    set((state) => {
      const next = new Set(state.selectedItemIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedItemIds: next, selectionAnchorId: id }
    }),

  reorderItems: (orderedIds) =>
    set((state) => {
      const byId = new Map(state.items.map((item) => [item.id, item]))
      const items = orderedIds.map((id) => byId.get(id)).filter((item): item is SetupItemDraft => item != null)
      return { items, isDirty: true }
    }),

  // Shift-click range selection: selects everything between the anchor (last plain-clicked
  // row) and the given row, inclusive, in visual order (items array order IS row order).
  selectRangeTo: (id) => {
    const state = get()
    const anchorId = state.selectionAnchorId
    if (anchorId == null) {
      state.selectItem(id)
      return
    }
    const anchorIndex = state.items.findIndex((item) => item.id === anchorId)
    const targetIndex = state.items.findIndex((item) => item.id === id)
    if (anchorIndex === -1 || targetIndex === -1) {
      state.selectItem(id)
      return
    }
    const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
    set({ selectedItemIds: new Set(state.items.slice(from, to + 1).map((item) => item.id)) })
  },

  // Fills the chosen field sequentially (start, start+1, ...) down the selected rows in
  // visual order — or every row when nothing is selected (fast whole-sheet numbering).
  applySequentialNumbering: (field, start) =>
    set((state) => {
      const targetAll = state.selectedItemIds.size === 0
      let next = Math.max(1, start)
      return {
        items: state.items.map((item) => {
          if (!targetAll && !state.selectedItemIds.has(item.id)) return item
          const value = next++
          // Cue box is a free-text field (stereo cues like "1-2"), so numbering writes strings.
          return field === 'cueBox' ? { ...item, cueBox: String(value) } : { ...item, [field]: value }
        }),
        isDirty: true
      }
    }),

  focusNumbering: () => set((state) => ({ numberingFocusTick: state.numberingFocusTick + 1 })),

  clearUnresolvedGearHint: (id, field) =>
    set((state) => {
      const existing = state.unresolvedGearHints.get(id)
      if (!existing) return {}
      const next = new Map(state.unresolvedGearHints)
      const { [field]: _removed, ...rest } = existing
      if (Object.keys(rest).length === 0) next.delete(id)
      else next.set(id, rest)
      return { unresolvedGearHints: next }
    }),

  // Appends the preset's rows to the current setup (doesn't replace existing ones). Any row
  // whose mic/outboard couldn't be matched in this studio's catalogue still gets added — just
  // unassigned, with a hint recorded so the table can flag it for the user to fix in place.
  applyChannelPreset: (presetItems) =>
    set((state) => {
      const newItems: SetupItemDraft[] = []
      const hints = new Map(state.unresolvedGearHints)
      for (const item of presetItems) {
        const id = newDraftId()
        newItems.push({
          id,
          instrumentType: item.instrumentType,
          sourceName: item.sourceName,
          micId: item.micId,
          micText: item.micName,
          phantomPower: false,
          channel: item.channel != null ? Math.max(1, item.channel) : null,
          tieLine: item.tieLine != null ? Math.max(1, item.tieLine) : null,
          cueBox: item.cueBox,
          // Channel Presets stay single-outboard (a reusable "typical chain," not a multi-slot
          // capture) — the preset's one outboard value always lands in slot 0.
          outboards:
            item.outboardId != null || item.outboardName
              ? [{ slotIndex: 0, outboardId: item.outboardId, outboardText: item.outboardName }]
              : [],
          preampId: item.preampId,
          preampText: item.preampName,
          polarityFlip: item.polarityFlip ?? false,
          notes: item.notes,
          color: item.color ?? null,
          groupId: null
        })
        if (item.unresolvedMicName || item.unresolvedOutboardName || item.unresolvedPreampName) {
          hints.set(id, {
            mic: item.unresolvedMicName,
            outboard: item.unresolvedOutboardName,
            preamp: item.unresolvedPreampName
          })
        }
      }
      return { items: [...state.items, ...newItems], unresolvedGearHints: hints, isDirty: true }
    }),

  save: async () => {
    const state = get()
    if (!state.studioId) return
    set({ isSaving: true })
    try {
      let setupId = state.setupId
      if (!setupId) {
        const created = await window.api.setups.create(
          state.studioId,
          state.name,
          state.sessionDate,
          state.folderId,
          state.engineer,
          state.artist,
          state.facultyReserveEnabled,
          state.sessionNotes
        )
        setupId = created.id
        if (state.outboardColumnCount !== 1) {
          await window.api.setups.setOutboardColumnCount(setupId, state.outboardColumnCount)
        }
      } else {
        await window.api.setups.rename(
          setupId,
          state.name,
          state.sessionDate,
          state.engineer,
          state.artist,
          state.facultyReserveEnabled,
          state.sessionNotes
        )
      }

      // Columns are re-asserted on EVERY save, read fresh via get() rather than from the
      // pre-await snapshot. Two failure modes this closes: (1) the Columns popover's own
      // write-throughs are fire-and-forget, so a single dropped IPC would silently resurrect a
      // hidden column on reopen; (2) on a FIRST save, a toggle made while create() was in flight
      // couldn't write through (setupId was still null) and the snapshot here predates it — the
      // stale write then clobbered the toggle and isDirty:false below discarded the retry.
      await window.api.setups.setVisibleColumns(setupId, get().visibleColumns)
      await window.api.setups.setColumnOrder(setupId, get().columnOrder)
      await window.api.setups.setExportColumnOverrides(setupId, get().exportColumnOverrides)

      const itemsBeforeSave = state.items
      const saved = await window.api.setups.saveItems(
        setupId,
        itemsBeforeSave.map((item) => ({ ...item }))
      )

      // saveItems assigns each row's sort_order from its array index and returns rows
      // ordered by sort_order, so saved[i] is itemsBeforeSave[i] with its real DB id.
      // To avoid a full-table re-render one second after every commit, rows keep their
      // current object identity — the DB row's content is exactly what we just sent, so
      // there's nothing new to adopt except ids: rows that were new (string draft id)
      // swap in their DB-assigned id, everything else is untouched. Pending
      // unresolvedGearHints keyed by a draft id are remapped the same way.
      const newIdByDraftId = new Map<string, number>()
      itemsBeforeSave.forEach((oldItem, index) => {
        const savedItem = saved[index]
        if (typeof oldItem.id === 'string' && savedItem) newIdByDraftId.set(oldItem.id, savedItem.id)
      })

      // Read the store fresh: the user may have kept editing during the awaited IPC call,
      // and those edits must not be clobbered by the pre-save snapshot.
      const currentItems = get().items
      const currentHints = get().unresolvedGearHints
      let nextItems = currentItems
      let nextHints = currentHints
      if (newIdByDraftId.size > 0) {
        nextItems = currentItems.map((item) =>
          typeof item.id === 'string' && newIdByDraftId.has(item.id)
            ? { ...item, id: newIdByDraftId.get(item.id)! }
            : item
        )
        nextHints = new Map<number | string, UnresolvedGearHint>()
        currentHints.forEach((hint, id) => {
          const newId = typeof id === 'string' ? newIdByDraftId.get(id) : undefined
          nextHints.set(newId ?? id, hint)
        })
      }

      set({ setupId, items: nextItems, unresolvedGearHints: nextHints, isDirty: false, isSaving: false })
    } catch (err) {
      set({ isSaving: false })
      throw err
    }
  }
    }),
    {
      partialize: (state) => ({
        items: state.items,
        outboardColumnCount: state.outboardColumnCount,
        name: state.name,
        sessionDate: state.sessionDate,
        engineer: state.engineer,
        artist: state.artist,
        sessionNotes: state.sessionNotes,
        facultyReserveEnabled: state.facultyReserveEnabled
      }),
      // Without an equality check zundo snapshots on EVERY set() — selection clicks,
      // numbering-focus ticks, and hint updates would fill the undo stack with entries
      // identical to the present state (Cmd+Z "does nothing" and real edits get evicted).
      // All partialized slices are immutably replaced, so reference compares are exact.
      equality: (past, current) =>
        past.items === current.items &&
        past.outboardColumnCount === current.outboardColumnCount &&
        past.name === current.name &&
        past.sessionDate === current.sessionDate &&
        past.engineer === current.engineer &&
        past.artist === current.artist &&
        past.sessionNotes === current.sessionNotes &&
        past.facultyReserveEnabled === current.facultyReserveEnabled,
      limit: 100
    }
  )
  )
  return store
}

/** The app-wide default instance — every existing single-setup call site keeps using this
 *  unchanged. Split View's second pane gets its own separate `createSetupStore()` instance
 *  instead (see setupStoreContext.tsx); this singleton remains pane A's store. */
export const useSetupStore = createSetupStore()
