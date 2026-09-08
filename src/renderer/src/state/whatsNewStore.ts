import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { CHANGELOG_ENTRIES, type ChangelogEntry } from '@shared/constants/changelog'

interface WhatsNewState {
  open: boolean
  /** Entries to display in the currently-open modal, oldest→newest. */
  entries: ChangelogEntry[]
  load(): Promise<void>
  openManually(): void
  close(): void
}

export const useWhatsNewStore = create<WhatsNewState>((set) => ({
  open: false,
  entries: [],

  // Called once at startup (App.tsx). Compares app.getVersion() against the persisted
  // last_seen_version. A fresh install (setting never recorded) silently records the current
  // version and does NOT open the modal — see APP_SETTINGS_KEYS.lastSeenVersion. A real upgrade
  // (setting present and different) opens the modal, then immediately persists the new version so
  // it won't re-show on next launch even if the user closes without reading — re-access is always
  // available via the menu item.
  //
  // Shows the WHOLE changelog, not just entries newer than the recorded version. Someone skipping
  // several releases would otherwise get a different modal from someone tracking every one, and
  // the full history reads fine now the list scrolls inside a fixed window (WhatsNewModal.tsx).
  // last_seen_version therefore only decides WHETHER to open, never what to put in it.
  load: async () => {
    const [version, lastSeen] = await Promise.all([
      window.api.app.getVersion(),
      window.api.settings.get(APP_SETTINGS_KEYS.lastSeenVersion)
    ])
    if (lastSeen === null) {
      await window.api.settings.set(APP_SETTINGS_KEYS.lastSeenVersion, version)
      return
    }
    if (lastSeen === version) return
    await window.api.settings.set(APP_SETTINGS_KEYS.lastSeenVersion, version)
    set({ open: true, entries: CHANGELOG_ENTRIES })
  },

  // "What's New…" menu item (and the hidden debug keybind). Same content as the automatic popup;
  // the only difference is that this one deliberately does NOT touch last_seen_version, keeping
  // the manual entry point free of persistence side effects.
  openManually: () => set({ open: true, entries: CHANGELOG_ENTRIES }),

  close: () => set({ open: false })
}))
