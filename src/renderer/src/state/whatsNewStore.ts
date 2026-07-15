import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { CHANGELOG_ENTRIES, type ChangelogEntry } from '@shared/constants/changelog'
import { getNewChangelogEntries } from '@shared/utils/changelogUtils'

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
  // (setting present and different) opens the modal with every entry newer than what was
  // recorded, then immediately persists the new version so the modal won't re-show on next launch
  // even if the user closes without reading — re-access is always available via the menu item.
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
    const entries = getNewChangelogEntries(lastSeen)
    await window.api.settings.set(APP_SETTINGS_KEYS.lastSeenVersion, version)
    if (entries.length > 0) set({ open: true, entries })
  },

  // "What's New…" menu item (and the hidden debug keybind). Shows the complete history rather
  // than re-deriving "what's new since last seen" — the user is explicitly asking to review, not
  // being told what changed since their last launch. Deliberately does NOT touch
  // last_seen_version, keeping this entry point's persistence free of side effects.
  openManually: () => set({ open: true, entries: CHANGELOG_ENTRIES }),

  close: () => set({ open: false })
}))
