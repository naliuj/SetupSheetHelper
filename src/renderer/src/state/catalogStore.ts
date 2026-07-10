import { create } from 'zustand'
import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'

interface CatalogState {
  studioId: number | null
  buildingId: number | null
  isTemporary: boolean
  mics: Mic[]
  outboardGear: OutboardGear[]
  preamps: Preamp[]
  loading: boolean

  loadForStudio(
    studioId: number,
    buildingId: number | null,
    setupId?: number | null,
    facultyReserveEnabled?: boolean
  ): Promise<void>
}

export const useCatalogStore = create<CatalogState>((set) => ({
  studioId: null,
  buildingId: null,
  isTemporary: false,
  mics: [],
  outboardGear: [],
  preamps: [],
  loading: false,

  loadForStudio: async (studioId, buildingId, setupId, facultyReserveEnabled) => {
    set({ loading: true, studioId, buildingId })
    const [studio, mics, outboardGear, preamps] = await Promise.all([
      window.api.studios.get(studioId),
      window.api.mics.listAvailableForStudio(studioId, setupId, facultyReserveEnabled),
      window.api.outboard.listAvailableForStudio(studioId, setupId, facultyReserveEnabled),
      window.api.preamps.listAvailableForStudio(studioId, setupId, facultyReserveEnabled)
    ])
    set({
      mics,
      outboardGear,
      preamps,
      isTemporary: studio?.isTemporary ?? false,
      loading: false
    })
  }
}))
