import { create } from 'zustand'

export type View = 'home' | 'picker' | 'admin' | 'setup' | 'studioSetup' | 'settings'
export type EditorMode = 'table' | 'layout'

interface NavigationState {
  view: View
  buildingId: number | null
  studioId: number | null
  setupId: number | null
  /** The custom studio being edited in the full-window Studio Setup page; null means creating a new one. */
  studioSetupId: number | null
  /** The view that was active right before Settings was opened, so closing Settings can return
   *  there (e.g. back into the same setup) instead of always going Home. */
  previousView: View | null
  /** Table vs. Layout mode in the Setup Editor — lives here (not local component state) so it
   *  survives SetupEditor unmounting/remounting when the user detours through Settings. */
  editorMode: EditorMode

  goToHome(): void
  goToPicker(): void
  goToBuilding(buildingId: number): void
  goToStudioAdmin(buildingId: number, studioId: number): void
  /** buildingId is null for custom (buildingless) studios. */
  goToSetup(buildingId: number | null, studioId: number, setupId: number | null): void
  goToStudioSetup(studioId: number | null): void
  goToSettings(): void
  closeSettings(): void
  setEditorMode(mode: EditorMode): void
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  view: 'home',
  buildingId: null,
  studioId: null,
  setupId: null,
  studioSetupId: null,
  previousView: null,
  editorMode: 'table',

  goToHome: () => set({ view: 'home', setupId: null }),
  goToPicker: () => set({ view: 'picker', studioId: null, setupId: null }),
  goToBuilding: (buildingId) => set({ view: 'picker', buildingId, studioId: null, setupId: null }),
  goToStudioAdmin: (buildingId, studioId) => set({ view: 'admin', buildingId, studioId, setupId: null }),
  goToSetup: (buildingId, studioId, setupId) => set({ view: 'setup', buildingId, studioId, setupId }),
  goToStudioSetup: (studioId) => set({ view: 'studioSetup', studioSetupId: studioId }),
  goToSettings: () => {
    const current = get().view
    set({ view: 'settings', previousView: current === 'settings' ? get().previousView : current })
  },
  closeSettings: () => set({ view: get().previousView ?? 'home', previousView: null }),
  setEditorMode: (mode) => set({ editorMode: mode })
}))
