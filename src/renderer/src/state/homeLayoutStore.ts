import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { parseHomeLayout, type HomeLayout } from '@shared/constants/homeLayout'

interface HomeLayoutState {
  /** How the home screen renders both sections. Loaded from app_settings; defaults to blocks. */
  layout: HomeLayout
  load(): Promise<void>
  setLayout(layout: HomeLayout): Promise<void>
}

export const useHomeLayoutStore = create<HomeLayoutState>((set) => ({
  layout: 'blocks',

  load: async () => {
    const saved = await window.api.settings.get(APP_SETTINGS_KEYS.homeLayout)
    set({ layout: parseHomeLayout(saved) })
  },

  setLayout: async (layout) => {
    set({ layout })
    await window.api.settings.set(APP_SETTINGS_KEYS.homeLayout, layout)
  }
}))
