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
  /** Split View's right-hand pane — the setup opened alongside `setupId` via the "Split View"
   *  toolbar button. Null means not in split view; `setupId` (the left pane) is otherwise
   *  unaffected and stays the single source of truth for "the primary open setup." */
  splitSetupId: number | null
  /** Table vs. Layout mode for the right pane specifically, mirroring `editorMode` for the same
   *  reason: it must survive the global Settings-page detour, which unmounts all of SetupEditor
   *  (including a mounted SplitSetupView) rather than just toggling a local flag. */
  splitEditorMode: EditorMode

  goToHome(): void
  /** buildingId is null for custom (buildingless) studios. Leaving split view (if active) on any
   *  navigation to a (possibly different) setup — opening a setup from Home always starts fresh. */
  goToSetup(buildingId: number | null, studioId: number, setupId: number | null): void
  goToStudioSetup(studioId: number | null): void
  goToSettings(initialTab?: string): void
  closeSettings(): void
  setEditorMode(mode: EditorMode): void
  consumeSettingsInitialTab(): string | null
  /** Opens Split View with `setupId` as the right pane (the left pane is whatever `setupId` in
   *  this store already is). Caller is responsible for having flushed anything that needs it
   *  first — this action is a pure state flip. */
  openSplitView(setupId: number): void
  /** Collapses back to single-pane view. Caller is responsible for flushing both panes' dirty
   *  state first (see SplitSetupView.tsx) — this action is a pure state flip. */
  closeSplitView(): void
  setSplitEditorMode(mode: EditorMode): void
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
  splitSetupId: null,
  splitEditorMode: 'table',

  goToHome: () => set({ view: 'home', setupId: null, splitSetupId: null }),
  goToSetup: (buildingId, studioId, setupId) =>
    set({ view: 'setup', buildingId, studioId, setupId, splitSetupId: null }),
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
  },
  openSplitView: (setupId) => set({ splitSetupId: setupId, splitEditorMode: 'table' }),
  closeSplitView: () => set({ splitSetupId: null }),
  setSplitEditorMode: (mode) => set({ splitEditorMode: mode })
}))
