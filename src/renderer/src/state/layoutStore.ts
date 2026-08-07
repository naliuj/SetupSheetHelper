import { create } from 'zustand'
import { temporal } from 'zundo'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import { createSetupStore, useSetupStore } from './setupStore'
import { useToastStore } from './toastStore'

/** What createLayoutStore's save() needs from its paired setup store — just enough to read the
 *  current setupId at save time. Typed off createSetupStore's own return shape so it always
 *  matches, rather than hand-duplicating the relevant slice of SetupState. */
type SetupStoreApi = ReturnType<typeof createSetupStore>

function newDraftId(): string {
  return crypto.randomUUID()
}

const DEFAULT_SIZE = 44
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
// A bigger, discrete jump than the per-wheel-tick step in LayoutStage's handleWheel — keyboard/
// menu zoom is a deliberate single action, not a continuous gesture.
const KEYBOARD_ZOOM_STEP = 1.2

interface LayoutState {
  blocks: RoomLayoutBlockDraft[]
  selectedBlockIds: Set<number | string>
  zoomScale: number
  panX: number
  panY: number
  isDirty: boolean
  isSaving: boolean
  /** Bumped whenever the Layout Mode gate resolves (blank sheet chosen, or a file committed to
   *  the studio/setup) — LayoutBackground depends on this to know to re-fetch, since resolving
   *  the gate doesn't change studioId/setupId (the effect's other deps) on its own. */
  layoutBackgroundVersion: number

  loadForSetup(setupId: number | null): Promise<void>
  addBlock(
    label: string,
    shape: 'rect' | 'circle',
    color: string,
    x: number,
    y: number,
    width?: number,
    height?: number,
    personName?: string | null
  ): string
  updateBlockTransform(
    id: number | string,
    patch: Partial<Pick<RoomLayoutBlockDraft, 'x' | 'y' | 'width' | 'height' | 'rotation'>>
  ): void
  renameBlock(id: number | string, label: string, personName?: string | null): void
  updateBlockColor(id: number | string, color: string): void
  duplicateBlocks(ids: (number | string)[]): void
  removeBlocks(ids: (number | string)[]): void
  moveBlocksBy(ids: (number | string)[], dx: number, dy: number): void
  selectBlock(id: number | string | null): void
  toggleBlock(id: number | string): void
  selectBlocksInRect(ids: (number | string)[]): void
  selectAllBlocks(): void
  setZoomPan(zoomScale: number, panX: number, panY: number): void
  zoomIn(): void
  zoomOut(): void
  resetView(): void
  save(): Promise<void>
  bumpLayoutBackgroundVersion(): void
}

/** Builds one independent layout-store instance, paired to a specific setup-store instance.
 *  Layout Mode's store is fully independent of setupStore/Table Mode (no shared items, no
 *  shared fields) EXCEPT one deliberate coupling point: save() reads the paired setup store's
 *  setupId directly at save time (rather than duplicating it here), so a brand-new setup's
 *  first-ever placed block always has a valid setup id to save against without explicit
 *  cross-store wiring at every call site. `setupStoreApi` is that pairing — passed in rather
 *  than importing the singleton, so Split View's second pane can wire its own layout-store
 *  instance to its own setup-store instance instead of both panes fighting over one.
 *
 *  Selection is a Set (multi-select), following Table Mode's setupStore.selectedItemIds
 *  pattern. zoomScale/panX/panY are purely transient view state — layered on top of
 *  LayoutStage.tsx's own fit-to-container calc, never persisted to the DB, reset whenever a
 *  different setup loads. */
export function createLayoutStore(setupStoreApi: SetupStoreApi) {
  const store = create<LayoutState>()(
  temporal(
    (set, get) => ({
      blocks: [],
      selectedBlockIds: new Set<number | string>(),
      zoomScale: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      isSaving: false,
      layoutBackgroundVersion: 0,

      loadForSetup: async (setupId) => {
        store.temporal.getState().clear()
        if (!setupId) {
          set({ blocks: [], selectedBlockIds: new Set(), zoomScale: 1, panX: 0, panY: 0, isDirty: false })
          return
        }
        const blocks = await window.api.roomLayoutBlocks.listBySetup(setupId)
        set({ blocks, selectedBlockIds: new Set(), zoomScale: 1, panX: 0, panY: 0, isDirty: false })
      },

      addBlock: (label, shape, color, x, y, width = DEFAULT_SIZE, height = DEFAULT_SIZE, personName = null) => {
        const id = newDraftId()
        const maxZ = get().blocks.reduce((max, b) => Math.max(max, b.zIndex), 0)
        const draft: RoomLayoutBlockDraft = {
          id,
          label,
          shape,
          color,
          x,
          y,
          width,
          height,
          rotation: 0,
          zIndex: maxZ + 1,
          personName
        }
        set({ blocks: [...get().blocks, draft], isDirty: true, selectedBlockIds: new Set([id]) })
        return id
      },

      updateBlockTransform: (id, patch) =>
        set((state) => ({
          blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
          isDirty: true
        })),

      renameBlock: (id, label, personName) =>
        set((state) => ({
          blocks: state.blocks.map((b) =>
            b.id === id ? { ...b, label, ...(personName !== undefined ? { personName } : {}) } : b
          ),
          isDirty: true
        })),

      updateBlockColor: (id, color) =>
        set((state) => ({
          blocks: state.blocks.map((b) => (b.id === id ? { ...b, color } : b)),
          isDirty: true
        })),

      // Duplicates every listed block together (e.g. the whole current selection on Cmd+D),
      // offsetting all by the same delta and selecting the new copies as the new selection.
      duplicateBlocks: (ids) =>
        set((state) => {
          const idSet = new Set(ids)
          const originals = state.blocks.filter((b) => idSet.has(b.id))
          if (originals.length === 0) return {}
          let maxZ = state.blocks.reduce((max, b) => Math.max(max, b.zIndex), 0)
          const duplicates: RoomLayoutBlockDraft[] = originals.map((original) => {
            maxZ += 1
            return { ...original, id: newDraftId(), x: original.x + 20, y: original.y + 20, zIndex: maxZ }
          })
          return {
            blocks: [...state.blocks, ...duplicates],
            isDirty: true,
            selectedBlockIds: new Set(duplicates.map((d) => d.id))
          }
        }),

      removeBlocks: (ids) => {
        set((state) => {
          const idSet = new Set(ids)
          const selectedBlockIds = new Set([...state.selectedBlockIds].filter((id) => !idSet.has(id)))
          return {
            blocks: state.blocks.filter((b) => !idSet.has(b.id)),
            selectedBlockIds,
            isDirty: true
          }
        })
        if (ids.length > 0) {
          useToastStore
            .getState()
            .show(`Deleted ${ids.length} block${ids.length === 1 ? '' : 's'}`, () =>
              store.temporal.getState().undo()
            )
        }
      },

      // Shifts every listed block by the same (dx, dy) — used for group-drag: dragging one
      // block that's part of a larger selection moves every other selected block along with it
      // by the same delta. Only the actively-dragged block goes through its own Konva
      // dragBoundFunc clamp (LayoutBlockIcon.tsx); other group members shift unclamped, so a
      // block dragged hard against the room boundary could carry the rest slightly past it —
      // an accepted simplification rather than full group-bounding-box clamping.
      moveBlocksBy: (ids, dx, dy) =>
        set((state) => {
          const idSet = new Set(ids)
          return {
            blocks: state.blocks.map((b) => (idSet.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
            isDirty: true
          }
        }),

      selectBlock: (id) => set({ selectedBlockIds: id != null ? new Set([id]) : new Set() }),

      toggleBlock: (id) =>
        set((state) => {
          const next = new Set(state.selectedBlockIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { selectedBlockIds: next }
        }),

      selectBlocksInRect: (ids) => set({ selectedBlockIds: new Set(ids) }),

      selectAllBlocks: () => set((state) => ({ selectedBlockIds: new Set(state.blocks.map((b) => b.id)) })),

      setZoomPan: (zoomScale, panX, panY) =>
        set({ zoomScale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale)), panX, panY }),

      // Scales in place (pan unchanged) — keyboard/menu zoom has no cursor position to anchor to,
      // unlike handleWheel's cursor-centered zoom in LayoutStage.tsx.
      zoomIn: () =>
        set((state) => ({ zoomScale: Math.min(MAX_ZOOM, state.zoomScale * KEYBOARD_ZOOM_STEP) })),

      zoomOut: () =>
        set((state) => ({ zoomScale: Math.max(MIN_ZOOM, state.zoomScale / KEYBOARD_ZOOM_STEP) })),

      resetView: () => set({ zoomScale: 1, panX: 0, panY: 0 }),

      save: async () => {
        const setupId = setupStoreApi.getState().setupId
        if (!setupId) return
        const state = get()
        set({ isSaving: true })
        try {
          const saved = await window.api.roomLayoutBlocks.saveForSetup(
            setupId,
            state.blocks.map((b) => ({ ...b }))
          )
          set({ blocks: saved, isDirty: false, isSaving: false })
        } catch (err) {
          set({ isSaving: false })
          throw err
        }
      },

      bumpLayoutBackgroundVersion: () => set((state) => ({ layoutBackgroundVersion: state.layoutBackgroundVersion + 1 }))
    }),
    {
      partialize: (state) => ({ blocks: state.blocks }),
      // Without an equality check zundo snapshots on EVERY set() — panning/zooming
      // (setZoomPan per mousemove/wheel tick) and selection changes would flush all 100
      // real undo entries in one gesture. Blocks are immutably replaced on every real
      // edit, so a reference compare is exact.
      equality: (past, current) => past.blocks === current.blocks,
      limit: 100
    }
  )
  )
  return store
}

/** The app-wide default instance, paired to the default setupStore singleton — every existing
 *  single-setup call site keeps using this unchanged. Split View's second pane gets its own
 *  separate `createLayoutStore(...)` instance, paired to that pane's own setup store, instead
 *  (see layoutStoreContext.tsx); this singleton remains pane A's store. */
export const useLayoutStore = createLayoutStore(useSetupStore)
