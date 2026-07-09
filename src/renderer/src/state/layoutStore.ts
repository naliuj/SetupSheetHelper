import { create } from 'zustand'
import { temporal } from 'zundo'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import { useSetupStore } from './setupStore'

function newDraftId(): string {
  return crypto.randomUUID()
}

const DEFAULT_SIZE = 44

interface LayoutState {
  blocks: RoomLayoutBlockDraft[]
  selectedBlockId: number | string | null
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
  removeBlock(id: number | string): void
  selectBlock(id: number | string | null): void
  save(): Promise<void>
}

/** Layout Mode's own store — fully independent of setupStore/Table Mode (no shared items,
 *  no shared fields). Blocks are purely spatial: label/shape/color/x/y/width/height/rotation,
 *  nothing about mics/channels/tie-lines. The one deliberate coupling point: save() reads
 *  useSetupStore's setupId directly at save time (rather than duplicating it here), so a
 *  brand-new setup's first-ever placed block always has a valid setup id to save against
 *  without needing explicit cross-store wiring at every call site. */
export const useLayoutStore = create<LayoutState>()(
  temporal(
    (set, get) => ({
      blocks: [],
      selectedBlockId: null,
      isDirty: false,
      isSaving: false,

      loadForSetup: async (setupId) => {
        useLayoutStore.temporal.getState().clear()
        if (!setupId) {
          set({ blocks: [], selectedBlockId: null, isDirty: false })
          return
        }
        const blocks = await window.api.roomLayoutBlocks.listBySetup(setupId)
        set({ blocks, selectedBlockId: null, isDirty: false })
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
        set((state) => ({ blocks: [...state.blocks, draft], isDirty: true, selectedBlockId: id }))
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

      removeBlock: (id) =>
        set((state) => ({
          blocks: state.blocks.filter((b) => b.id !== id),
          selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId,
          isDirty: true
        })),

      selectBlock: (id) => set({ selectedBlockId: id }),

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
