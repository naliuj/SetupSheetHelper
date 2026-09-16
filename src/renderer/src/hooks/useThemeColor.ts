import { useEffect, useState } from 'react'
import { useThemeStore } from '@renderer/state/themeStore'

function readCssVar(property: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim()
}

/** The resolved value of a CSS custom property, re-read whenever the theme changes.
 *
 *  For Konva. It paints to a canvas, so every color it draws has to be a literal string — `var()`
 *  is not available to it at all. That is how the marquee rectangle ended up hardcoded to a steel
 *  blue that was neither theme's accent, and stayed that way through a whole theme being added.
 *  Reading the token keeps the canvas on the same value as the DOM instead of a near-match that
 *  drifts.
 *
 *  Safe against effect ordering because useThemeSync writes `data-theme` in its IPC callback
 *  rather than in an effect — see the comment there. */
export function useThemeColor(property: string): string {
  const resolved = useThemeStore((s) => s.resolved)
  const [value, setValue] = useState(() => readCssVar(property))

  useEffect(() => {
    setValue(readCssVar(property))
  }, [property, resolved])

  return value
}
