import { create } from 'zustand'
import type { PaletteItem } from '@shared/types/palette'

interface PaletteState {
  items: PaletteItem[]
  allItems: PaletteItem[]

  load(): Promise<void>
  loadAll(): Promise<void>
  addCustom(label: string, shape: 'rect' | 'circle', color: string, category: string): Promise<void>
  update(
    id: number,
    patch: Partial<Pick<PaletteItem, 'label' | 'shape' | 'color' | 'category' | 'isHidden'>>
  ): Promise<void>
  removeCustom(id: number): Promise<void>
  reorder(ids: number[]): Promise<void>
}

/** Loaded once at app startup (App.tsx) — not per-setup, not per-studio. This is the one
 *  deliberately global/app-wide store in the app: the palette customizations (reorder, hidden
 *  built-ins, added customs) are shared across every studio and setup. */
export const usePaletteStore = create<PaletteState>((set, get) => ({
  items: [],
  allItems: [],

  load: async () => {
    const items = await window.api.palette.listVisible()
    set({ items })
  },

  loadAll: async () => {
    const allItems = await window.api.palette.listAll()
    set({ allItems })
  },

  addCustom: async (label, shape, color, category) => {
    await window.api.palette.createCustom({ label, shape, color, category })
    await get().load()
    await get().loadAll()
  },

  update: async (id, patch) => {
    await window.api.palette.update(id, patch)
    await get().load()
    await get().loadAll()
  },

  removeCustom: async (id) => {
    await window.api.palette.removeCustom(id)
    await get().load()
    await get().loadAll()
  },

  reorder: async (ids) => {
    // Optimistic reorder for a responsive drag — waiting for the round-trip + reload would
    // otherwise flash the old order back in before the DB write resolves.
    set((state) => {
      const byId = new Map(state.allItems.map((item) => [item.id, item]))
      const allItems = ids.map((id) => byId.get(id)).filter((item): item is PaletteItem => item != null)
      return { allItems }
    })
    await window.api.palette.reorder(ids)
    await get().load()
  }
}))
