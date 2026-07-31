import { create } from 'zustand'

interface LayoutWindowState {
  /** The setup currently open in the standalone Layout Mode window, or null if it's closed.
   *  Mirrors main/layoutWindow.ts's own tracking — pushed here via onStateChanged so every window
   *  (today: just the main window) can react without polling. */
  openForSetupId: number | null
  hydrate(): Promise<void>
}

/** Only meaningful in the MAIN window — SetupToolbar reads it to grey out the Layout Mode toggle
 *  for whichever setup is popped out, and SetupEditor reads it to skip mounting its own LayoutStage
 *  for that setup (see the comment on that mount in SetupEditor.tsx). The standalone Layout window
 *  itself has no use for this — it doesn't render a toggle or a second canvas. */
export const useLayoutWindowStore = create<LayoutWindowState>((set) => ({
  openForSetupId: null,
  hydrate: async () => {
    const state = await window.api.layoutWindow.getState()
    set({ openForSetupId: state.openForSetupId })
  }
}))

// Subscribes once at module load (not inside a component effect) — this store's whole reason to
// exist is staying current for as long as the window is open, not for the lifetime of whichever
// component happens to be mounted when it's created.
window.api.layoutWindow.onStateChanged((state) => {
  useLayoutWindowStore.setState({ openForSetupId: state.openForSetupId })
})
