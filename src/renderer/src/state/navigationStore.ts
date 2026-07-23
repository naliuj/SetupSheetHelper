import { create } from 'zustand'
import type { EditorMode } from '@shared/types/setup'

export type View = 'home' | 'setup' | 'studioSetup' | 'settings'
export type { EditorMode }

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
  /** Which Settings tab to land on next time it opens — set by goToSettings(tab), consumed once
   *  by SettingsPage's initial activeTab state and cleared so a later plain "Cmd+," open (or
   *  clicking a tab button) doesn't keep bouncing back to it. */
  settingsInitialTab: string | null

  goToHome(): void
  /** buildingId is null for custom (buildingless) studios. */
  goToSetup(buildingId: number | null, studioId: number, setupId: number | null): void
  goToStudioSetup(studioId: number | null): void
  goToSettings(initialTab?: string): void
  closeSettings(): void
  setEditorMode(mode: EditorMode): void
  consumeSettingsInitialTab(): string | null
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  view: 'home',
  buildingId: null,
  studioId: null,
  setupId: null,
  studioSetupId: null,
  previousView: null,
  editorMode: 'table',
  settingsInitialTab: null,

  goToHome: () => set({ view: 'home', setupId: null }),
  goToSetup: (buildingId, studioId, setupId) => set({ view: 'setup', buildingId, studioId, setupId }),
  goToStudioSetup: (studioId) => set({ view: 'studioSetup', studioSetupId: studioId }),
  goToSettings: (initialTab) => {
    const current = get().view
    set({
      view: 'settings',
      previousView: current === 'settings' ? get().previousView : current,
      settingsInitialTab: initialTab ?? null
    })
  },
  closeSettings: () => set({ view: get().previousView ?? 'home', previousView: null }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  consumeSettingsInitialTab: () => {
    const tab = get().settingsInitialTab
    set({ settingsInitialTab: null })
    return tab
  }
}))
