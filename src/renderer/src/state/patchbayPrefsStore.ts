import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { CABLE_COLORS, DEFAULT_CABLE_COLOR, DEFAULT_CABLE_SAG } from '@shared/constants/patchCables'
import type { PlugStyle } from '@renderer/pages/SetupEditor/patchbay/cableGeometry'

interface PatchbayPrefsState {
  color: string
  sag: number
  /** How every cable's plugs are drawn, in the editor and in exports. */
  plugStyle: PlugStyle
  load(): Promise<void>
  set(patch: Partial<Pick<PatchbayPrefsState, 'color' | 'sag' | 'plugStyle'>>): void
}

/** The color and sag the next cable is drawn with — whatever was last picked, remembered across
 *  launches like the markup toolbar's pen — and the app-wide plug style. */
export const usePatchbayPrefsStore = create<PatchbayPrefsState>((set, get) => ({
  color: DEFAULT_CABLE_COLOR,
  sag: DEFAULT_CABLE_SAG,
  plugStyle: 'ring',

  load: async () => {
    try {
      const raw = await window.api.settings.get(APP_SETTINGS_KEYS.patchbayPrefs)
      const saved = raw ? (JSON.parse(raw) as Partial<PatchbayPrefsState>) : {}
      set({
        color: CABLE_COLORS.some((c) => c.hex === saved.color) ? (saved.color as string) : DEFAULT_CABLE_COLOR,
        sag: typeof saved.sag === 'number' && saved.sag >= 0 && saved.sag <= 1 ? saved.sag : DEFAULT_CABLE_SAG,
        plugStyle: saved.plugStyle === 'solid' ? 'solid' : 'ring'
      })
    } catch {
      // Unreadable setting: keep the defaults.
    }
  },

  set: (patch) => {
    set(patch)
    const { color, sag, plugStyle } = get()
    void window.api.settings.set(APP_SETTINGS_KEYS.patchbayPrefs, JSON.stringify({ color, sag, plugStyle }))
  }
}))
