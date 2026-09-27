import { useEffect } from 'react'
import { useA11yPrefsStore } from '@renderer/state/a11yPrefsStore'

/** Keeps this window's accessibility preferences in step with every other one — the same job
 *  useThemeSync does, and for the same reason: a window that only read the setting at its own
 *  startup would sit on the stale value until it was reopened.
 *
 *  Hydration is not done here. main.tsx applies the bootstrap synchronously before React mounts,
 *  so by the time this runs the store and the DOM attribute are already correct. What is left is
 *  staying correct. */
export function useA11ySync(): void {
  useEffect(
    () =>
      window.api.accessibility.onChanged((state) => {
        // Written here rather than in an effect keyed off the store, for the reason useThemeSync
        // spells out: effects run child-first, so a descendant reading a resolved CSS variable
        // would otherwise see the old value on the render this change causes.
        document.documentElement.dataset.contrast = state.contrast
        useA11yPrefsStore.setState(state)
      }),
    []
  )
}
