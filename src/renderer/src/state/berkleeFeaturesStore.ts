import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'

interface BerkleeFeaturesState {
  /** null = not yet loaded, or loaded-and-never-answered — every gate treats this the same as
   *  false (hidden), so there's no flash of Berklee content before load() resolves. */
  enabled: boolean | null
  onboardingPromptOpen: boolean
  load(): Promise<void>
  enable(): Promise<void>
  disable(): Promise<void>
}

export const useBerkleeFeaturesStore = create<BerkleeFeaturesState>((set) => ({
  enabled: null,
  onboardingPromptOpen: false,

  load: async () => {
    const saved = await window.api.settings.get(APP_SETTINGS_KEYS.berkleeFeaturesEnabled)
    if (saved === 'true') set({ enabled: true, onboardingPromptOpen: false })
    else if (saved === 'false') set({ enabled: false, onboardingPromptOpen: false })
    else set({ enabled: null, onboardingPromptOpen: true })
  },

  enable: async () => {
    await window.api.berklee.enable()
    set({ enabled: true, onboardingPromptOpen: false })
  },

  disable: async () => {
    await window.api.berklee.disable()
    set({ enabled: false, onboardingPromptOpen: false })
  }
}))
