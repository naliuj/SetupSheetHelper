import { create } from 'zustand'
import type { ContrastPreference } from '@shared/constants/accessibility'

interface A11yPrefsState {
  contrast: ContrastPreference
  setContrast(preference: ContrastPreference): void
}

/** Accessibility preferences, mirroring themeStore: main owns the value, this is the window's copy.
 *
 *  These initial values are never rendered — main.tsx overwrites them synchronously, before
 *  createRoot, from the preload bootstrap. They exist only so the type is satisfied. */
export const useA11yPrefsStore = create<A11yPrefsState>((set) => ({
  contrast: 'system',
  setContrast: (contrast) => {
    // Optimistic, so Settings responds instantly; main's broadcast arrives a tick later and
    // reconciles this window and every other one.
    set({ contrast })
    void window.api.accessibility.setContrast(contrast)
  }
}))
