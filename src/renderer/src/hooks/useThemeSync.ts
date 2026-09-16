import { useEffect } from 'react'
import { useThemeStore } from '@renderer/state/themeStore'

/** Keeps this window's theme in step with every other one.
 *
 *  Replaces a hydrate-from-IPC effect that App.tsx and LayoutWindowApp.tsx each had their own copy
 *  of. Those copies read the setting once at startup and never heard about changes, which is why
 *  toggling the theme left an open pop-out Layout window on the old one until it was reopened.
 *
 *  Hydration itself is gone from here: main.tsx applies the bootstrap synchronously before React
 *  mounts, so by the time this runs the store and the DOM attribute are already correct. What is
 *  left is staying correct. */
export function useThemeSync(): void {
  useEffect(
    () =>
      window.api.theme.onChanged((state) => {
        // The attribute is written HERE, before setState, rather than in an effect keyed off the
        // store. Effects run child-first, so anything deeper in the tree that reads a resolved CSS
        // variable — useThemeColor, for the Konva canvas — would otherwise run before this
        // component's effect and read the OLD palette. Writing it in the callback means the DOM is
        // already correct before any render caused by this change, at any depth.
        document.documentElement.dataset.theme = state.resolved
        useThemeStore.setState(state)
      }),
    []
  )
}
