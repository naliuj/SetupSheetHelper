import { create } from 'zustand'
import { temporal } from 'zundo'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import { useSetupStore } from './setupStore'

function newDraftId(): string {
  return crypto.randomUUID()
}

const DEFAULT_SIZE = 44
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

interface LayoutState {
  blocks: RoomLayoutBlockDraft[]
  selectedBlockIds: Set<number | string>
  zoomScale: number
  panX: number
  panY: number
  isDirty: boolean
  isSaving: boolean

  loadForSetup(setupId: number | null): Promise<void>
  addBlock(
    label: string,
    shape: 'rect' | 'circle',
    color: string,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): string
  updateBlockTransform(
    id: number | string,
    patch: Partial<Pick<RoomLayoutBlockDraft, 'x' | 'y' | 'width' | 'height' | 'rotation'>>
  ): void
  renameBlock(id: number | string, label: string): void
  updateBlockColor(id: number | string, color: string): void
  duplicateBlocks(ids: (number | string)[]): void
  removeBlocks(ids: (number | string)[]): void
  moveBlocksBy(ids: (number | string)[], dx: number, dy: number): void
  selectBlock(id: number | string | null): void
  toggleBlock(id: number | string): void
  selectBlocksInRect(ids: (number | string)[]): void
  setZoomPan(zoomScale: number, panX: number, panY: number): void
  resetView(): void
  save(): Promise<void>
}

/** Layout Mode's own store — fully independent of setupStore/Table Mode (no shared items,
 *  no shared fields). Blocks are purely spatial: label/shape/color/x/y/width/height/rotation,
 *  nothing about mics/channels/tie-lines. The one deliberate coupling point: save() reads
 *  useSetupStore's setupId directly at save time (rather than duplicating it here), so a
 *  brand-new setup's first-ever placed block always has a valid setup id to save against
 *  without needing explicit cross-store wiring at every call site.
 *
 *  Selection is a Set (multi-select), following Table Mode's setupStore.selectedItemIds
 *  pattern. zoomScale/panX/panY are purely transient view state — layered on top of
 *  LayoutStage.tsx's own fit-to-container calc, never persisted to the DB, reset whenever a
 *  different setup loads. */
export const useLayoutStore = create<LayoutState>()(
  temporal(
    (set, get) => ({
      blocks: [],
      selectedBlockIds: new Set<number | string>(),
      zoomScale: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      isSaving: false,

      loadForSetup: async (setupId) => {
        useLayoutStore.temporal.getState().clear()
        if (!setupId) {
          set({ blocks: [], selectedBlockIds: new Set(), zoomScale: 1, panX: 0, panY: 0, isDirty: false })
          return
        }
        const blocks = await window.api.roomLayoutBlocks.listBySetup(setupId)
        set({ blocks, selectedBlockIds: new Set(), zoomScale: 1, panX: 0, panY: 0, isDirty: false })
      },

      addBlock: (label, shape, color, x, y, width = DEFAULT_SIZE, height = DEFAULT_SIZE) => {
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
          zIndex: maxZ + 1
        }
        set({ blocks: [...get().blocks, draft], isDirty: true, selectedBlockIds: new Set([id]) })
        return id
      },

      updateBlockTransform: (id, patch) =>
        set((state) => ({
          blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
          isDirty: true
        })),

      renameBlock: (id, label) =>
        set((state) => ({
          blocks: state.blocks.map((b) => (b.id === id ? { ...b, label } : b)),
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

      removeBlocks: (ids) =>
        set((state) => {
          const idSet = new Set(ids)
          const selectedBlockIds = new Set([...state.selectedBlockIds].filter((id) => !idSet.has(id)))
          return {
            blocks: state.blocks.filter((b) => !idSet.has(b.id)),
            selectedBlockIds,
            isDirty: true
          }
        }),

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

      setZoomPan: (zoomScale, panX, panY) =>
        set({ zoomScale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale)), panX, panY }),

      resetView: () => set({ zoomScale: 1, panX: 0, panY: 0 }),

      save: async () => {
        const setupId = useSetupStore.getState().setupId
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
      }
    }),
    {
      partialize: (state) => ({ blocks: state.blocks }),
      limit: 100
    }
  )
)
