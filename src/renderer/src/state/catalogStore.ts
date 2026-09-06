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
  /** Re-runs the last load with the same arguments. Needed because the only caller of
   *  loadForStudio is an effect keyed on studio/building/setup identity, so editing the Session
   *  Gear Locker — which renders inside that very component and changes no identity — otherwise
   *  left the dropdowns showing a stale catalogue until the setup was reopened. */
  reload(): Promise<void>
}

/** Builds one independent catalogue-store instance — its own mics/outboard/preamps for whichever
 *  studio last loaded into it. Exists as a factory (rather than a single `create()` call at module
 *  scope) so Split View can instantiate a second, fully independent instance for its right-hand
 *  pane — see catalogStoreContext.tsx for how components resolve "which instance" without every
 *  consumer needing to be threaded a store prop. Mirrors setupStore.ts's createSetupStore(): both
 *  panes sharing this one singleton was invisibly safe only as long as Split View enforced
 *  same-studio pairing (identical catalogue either way); once panes can be different studios,
 *  whichever pane loaded last would otherwise clobber the other's dropdowns. */
export function createCatalogStore() {
  let lastArgs: {
    studioId: number
    buildingId: number | null
    setupId?: number | null
    facultyReserveEnabled?: boolean
  } | null = null

  return create<CatalogState>((set, get) => ({
    studioId: null,
    buildingId: null,
    isTemporary: false,
    mics: [],
    outboardGear: [],
    preamps: [],
    loading: false,

    loadForStudio: async (studioId, buildingId, setupId, facultyReserveEnabled) => {
      // Remembered so reload() can repeat this exact call; setupId and facultyReserveEnabled were
      // previously dropped on the floor, and both change what the union contains.
      lastArgs = { studioId, buildingId, setupId, facultyReserveEnabled }
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
    },

    reload: async () => {
      if (!lastArgs) return
      const { studioId, buildingId, setupId, facultyReserveEnabled } = lastArgs
      await get().loadForStudio(studioId, buildingId, setupId, facultyReserveEnabled)
    }
  }))
}

/** The app-wide singleton — everything outside Split View's second pane uses this unchanged. */
export const useCatalogStore = createCatalogStore()
