import { create } from 'zustand'
import type { Mic, OutboardGear } from '@shared/types/entities'

interface CatalogState {
  studioId: number | null
  buildingId: number | null
  isTemporary: boolean
  mics: Mic[]
  outboardGear: OutboardGear[]
  loading: boolean

  loadForStudio(studioId: number, buildingId: number | null, setupId?: number | null): Promise<void>
}

export const useCatalogStore = create<CatalogState>((set) => ({
  studioId: null,
  buildingId: null,
  isTemporary: false,
  mics: [],
  outboardGear: [],
  loading: false,

  loadForStudio: async (studioId, buildingId, setupId) => {
    set({ loading: true, studioId, buildingId })
    const [studio, mics, outboardGear] = await Promise.all([
      window.api.studios.get(studioId),
      window.api.mics.listAvailableForStudio(studioId, setupId),
      window.api.outboard.listAvailableForStudio(studioId, setupId)
    ])
    set({ mics, outboardGear, isTemporary: studio?.isTemporary ?? false, loading: false })
  }
}))
