import { create } from 'zustand'
import type { ResolvedTheme, ThemePreference } from '@shared/constants/theme'

interface ThemeState {
  /** What the user picked — 'system' included. */
  preference: ThemePreference
  /** What data-theme is set to, with 'system' already resolved against the OS by main. */
  resolved: ResolvedTheme
  setPreference(preference: ThemePreference): void
}

/** These initial values are never rendered: main.tsx overwrites them synchronously, before
 *  createRoot, from the preload bootstrap. They exist only so the type is satisfied. */
export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  resolved: 'dark',
  setPreference: (preference) => {
    // Optimistic, so Settings responds instantly. Main's broadcast arrives a tick later carrying
    // the authoritative `resolved` (which this cannot know for 'system') and reconciles both this
    // window and every other one.
    set({ preference })
    void window.api.theme.set(preference)
  }
}))
