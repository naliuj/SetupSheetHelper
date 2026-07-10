import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'

export type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  setTheme(theme: Theme): void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'dark',
  setTheme: (theme) => {
    set({ theme })
    void window.api.settings.set(APP_SETTINGS_KEYS.theme, theme)
  }
}))
