import { create } from 'zustand'
import type { MultiSetup, MultiSetupMember } from '@shared/types/setup'

/** The Multi Setup group the open setup belongs to, if any, plus its members in tab order.
 *
 *  This lives in a store rather than inside MultiSetupTabs (where it started) because the keyboard
 *  dispatcher and its handler map live in SetupToolbar — a *sibling* of the tab strip — and the
 *  Cmd/Ctrl+1..9 "go to setup N" handlers need the member list. Everything else about the tab strip
 *  stays in the component; this is only the shared slice. */
interface MultiSetupState {
  group: MultiSetup | null
  /** Ordered by `sort_order, id` — the single ordering authority, matching listMultiSetupMembers. */
  members: MultiSetupMember[]
  /** False only while the first fetch for a newly-opened setup is in flight, so the tab strip can
   *  render nothing instead of flashing "+ Add another setup…" at a setup that turns out to be
   *  grouped. Mutations call reload() without flipping this back to false. */
  loaded: boolean
  beginReload(): void
  reload(setupId: number | null): Promise<void>
}

export const useMultiSetupStore = create<MultiSetupState>((set) => ({
  group: null,
  members: [],
  loaded: false,

  beginReload: () => set({ loaded: false }),

  reload: async (setupId) => {
    if (setupId == null) {
      set({ group: null, members: [], loaded: true })
      return
    }
    const group = await window.api.multiSetups.getForSetup(setupId)
    // Fetched together so the strip never renders a group with a stale member list mid-update.
    const members = group ? await window.api.multiSetups.listMembers(group.id) : []
    set({ group, members, loaded: true })
  }
}))
