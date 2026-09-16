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
  const resolved = useThemeStore((s) => s.resolved)

  useEffect(() => window.api.theme.onChanged((state) => useThemeStore.setState(state)), [])

  // Writes the same value main.tsx already wrote on the first pass, so this cannot cause a flash;
  // it earns its keep on every change after that.
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])
}
