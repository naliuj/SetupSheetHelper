import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'

interface SnapPrefsState {
  /** Whether Layout Mode drags snap to guides. On by default; the canvas's Snap checkbox. */
  enabled: boolean
  load(): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
}

/** The Layout Mode "Snap" checkbox, remembered across launches. (Holding ⌘ mid-drag is the
 *  one-off override; this is the standing one.) */
export const useSnapPrefsStore = create<SnapPrefsState>((set) => ({
  enabled: true,

  load: async () => {
    const saved = await window.api.settings.get(APP_SETTINGS_KEYS.layoutSnapping)
    set({ enabled: saved !== '0' })
  },

  setEnabled: async (enabled) => {
    set({ enabled })
    await window.api.settings.set(APP_SETTINGS_KEYS.layoutSnapping, enabled ? '1' : '0')
  }
}))
