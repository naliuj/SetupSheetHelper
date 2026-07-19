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
  /** Renames a category, rewriting the string on every item currently in it. */
  renameCategory(oldName: string, newName: string): Promise<void>
  /** Removes a whole category: hard-deletes its custom items, soft-hides its built-in items
   *  (restorable via `update(id, { isHidden: false })`). */
  deleteCategory(category: string): Promise<void>
  /** Moves an item into `category` and persists the full new order in one optimistic step —
   *  used when dragging an item into a different category section. `ids` is the full flat id
   *  order after the move (kept contiguous per category by the caller). */
  recategorize(id: number, category: string, ids: number[]): Promise<void>
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
  },

  renameCategory: async (oldName, newName) => {
    await window.api.palette.renameCategory(oldName, newName)
    await get().load()
    await get().loadAll()
  },

  deleteCategory: async (category) => {
    await window.api.palette.deleteCategory(category)
    await get().load()
    await get().loadAll()
  },

  recategorize: async (id, category, ids) => {
    // Optimistically apply both the new category and the new order so the section move doesn't
    // flash — the item lands in its new group at its new position before the round-trip resolves.
    set((state) => {
      const byId = new Map(state.allItems.map((item) => [item.id, item]))
      const moved = byId.get(id)
      if (moved) byId.set(id, { ...moved, category })
      const allItems = ids.map((i) => byId.get(i)).filter((item): item is PaletteItem => item != null)
      return { allItems }
    })
    await window.api.palette.update(id, { category })
    await window.api.palette.reorder(ids)
    await get().load()
    await get().loadAll()
  }
}))
