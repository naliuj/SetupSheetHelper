import { create } from 'zustand'
import { temporal } from 'zundo'
import type { SetupItemDraft, SetupItemOutboardSlot, SetupWithItems } from '@shared/types/setup'

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
  cueBox: number | null
  polarityFlip: boolean | null
  notes: string | null
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
  folderId: number | null
  /** Off by default — students don't have access to faculty reserve gear. The sole gate for
   *  whether this setup can see it, regardless of which studio it belongs to. */
  facultyReserveEnabled: boolean
  items: SetupItemDraft[]
  /** How many "Outboard" columns the table currently shows — every row conceptually has this
   *  many slots (see SetupItemOutboardSlot), though a row may not have filled in every one. */
  outboardColumnCount: number
  /** Contiguous row selection (click = single, shift-click = range from the anchor). */
  selectedItemIds: Set<number | string>
  /** The last plain-clicked row — shift-click selects the range between it and the clicked row. */
  selectionAnchorId: number | string | null
  sequentialNumberingOpen: boolean
  saveChannelPresetOpen: boolean
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
  setFacultyReserveEnabled(enabled: boolean): void
  addItem(instrumentType: string, defaults?: NewItemDefaults): string
  addItemAt(instrumentType: string, defaults: NewItemDefaults): string
  updateItemFields(id: number | string, patch: Partial<SetupItemDraft>): void
  updateItemOutboardSlot(
    id: number | string,
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ): void
  addOutboardColumn(): Promise<void>
  removeItem(id: number | string): void
  removeItems(ids: Array<number | string>): void
  reorderItems(orderedIds: Array<number | string>): void
  selectItem(id: number | string | null): void
  selectRangeTo(id: number | string): void
  toggleItem(id: number | string): void
  selectAll(): void
  applySequentialNumbering(field: 'channel' | 'tieLine' | 'cueBox', start: number): void
  setSequentialNumberingOpen(open: boolean): void
  setSaveChannelPresetOpen(open: boolean): void
  clearUnresolvedGearHint(id: number | string, field: 'mic' | 'outboard' | 'preamp'): void
  applyChannelPreset(items: ResolvedChannelPresetItem[]): void
  save(): Promise<void>
}

export const useSetupStore = create<SetupState>()(
  temporal(
    (set, get) => ({
      setupId: null,
  studioId: null,
  name: 'Untitled Setup',
  sessionDate: null,
  engineer: null,
  artist: null,
  folderId: null,
  facultyReserveEnabled: false,
  items: [],
  outboardColumnCount: 1,
  selectedItemIds: new Set<number | string>(),
  selectionAnchorId: null,
  sequentialNumberingOpen: false,
  saveChannelPresetOpen: false,
  unresolvedGearHints: new Map(),
  isDirty: false,
  isSaving: false,

  startNewSetup: (studioId, name, sessionDate, folderId = null, engineer = null, artist = null) => {
    useSetupStore.temporal.getState().clear()
    set({
      setupId: null,
      studioId,
      name,
      sessionDate,
      engineer,
      artist,
      folderId,
      facultyReserveEnabled: false,
      items: [],
      outboardColumnCount: 1,
      selectedItemIds: new Set(),
      selectionAnchorId: null,
      unresolvedGearHints: new Map(),
      isDirty: false
    })
  },

  loadFromSetup: (setup) => {
    useSetupStore.temporal.getState().clear()
    set({
      setupId: setup.id,
      studioId: setup.studioId,
      name: setup.name,
      sessionDate: setup.sessionDate,
      engineer: setup.engineer,
      artist: setup.artist,
      folderId: setup.folderId,
      facultyReserveEnabled: setup.facultyReserveEnabled,
      items: setup.items,
      outboardColumnCount: setup.outboardColumnCount,
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
  setFacultyReserveEnabled: (facultyReserveEnabled) => set({ facultyReserveEnabled, isDirty: true }),

  addItem: (instrumentType, defaults) => get().addItemAt(instrumentType, defaults ?? {}),

  addItemAt: (instrumentType, defaults) => {
    const id = newDraftId()
    const draft: SetupItemDraft = {
      id,
      instrumentType,
      sourceName: defaults.sourceName ?? '',
      micId: defaults.micId ?? null,
      micText: null,
      channel: defaults.channel ?? null,
      tieLine: null,
      cueBox: null,
      outboards: [],
      preampId: null,
      preampText: null,
      polarityFlip: false,
      notes: defaults.notes ?? null
    }
    set((state) => ({
      items: [...state.items, draft],
      isDirty: true,
      selectedItemIds: new Set([id]),
      selectionAnchorId: id
    }))
    return id
  },

  updateItemFields: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      isDirty: true
    })),

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

  removeItem: (id) => get().removeItems([id]),

  removeItems: (ids) =>
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
    }),

  selectItem: (id) =>
    set({ selectedItemIds: id != null ? new Set([id]) : new Set(), selectionAnchorId: id }),

  selectAll: () =>
    set((state) => ({
      selectedItemIds: new Set(state.items.map((item) => item.id)),
      selectionAnchorId: null
    })),

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
          return { ...item, [field]: next++ }
        }),
        isDirty: true
      }
    }),

  setSequentialNumberingOpen: (open) => set({ sequentialNumberingOpen: open }),
  setSaveChannelPresetOpen: (open) => set({ saveChannelPresetOpen: open }),

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
          channel: item.channel != null ? Math.max(1, item.channel) : null,
          tieLine: item.tieLine != null ? Math.max(1, item.tieLine) : null,
          cueBox: item.cueBox != null ? Math.max(1, item.cueBox) : null,
          // Channel Presets stay single-outboard (a reusable "typical chain," not a multi-slot
          // capture) — the preset's one outboard value always lands in slot 0.
          outboards:
            item.outboardId != null || item.outboardName
              ? [{ slotIndex: 0, outboardId: item.outboardId, outboardText: item.outboardName }]
              : [],
          preampId: item.preampId,
          preampText: item.preampName,
          polarityFlip: item.polarityFlip ?? false,
          notes: item.notes
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
          state.facultyReserveEnabled
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
          state.facultyReserveEnabled
        )
      }

      const itemsBeforeSave = state.items
      const saved = await window.api.setups.saveItems(
        setupId,
        itemsBeforeSave.map((item) => ({ ...item }))
      )

      // saveItems assigns each row's sort_order from its array index and returns rows
      // ordered by sort_order, so saved[i] is itemsBeforeSave[i] with its real DB id — new
      // rows swap a temporary draft id for one assigned by the database. Remap any pending
      // unresolvedGearHints (set by applyChannelPreset) onto the new ids so the hint survives
      // this save instead of pointing at an id nothing has anymore.
      const currentHints = get().unresolvedGearHints
      const remappedHints = new Map<number | string, UnresolvedGearHint>()
      itemsBeforeSave.forEach((oldItem, index) => {
        const hint = currentHints.get(oldItem.id)
        const newItem = saved[index]
        if (hint && newItem) remappedHints.set(newItem.id, hint)
      })

      set({ setupId, items: saved, unresolvedGearHints: remappedHints, isDirty: false, isSaving: false })
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
        facultyReserveEnabled: state.facultyReserveEnabled
      }),
      limit: 100
    }
  )
)
