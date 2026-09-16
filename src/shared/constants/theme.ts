/** The user's appearance preference (Settings → Theme), stored as a single app-setting string.
 *  Distinct from the RESOLVED theme: 'system' is a preference, never something the DOM sees —
 *  main resolves it against the OS and every window keys `data-theme` off the concrete value. */
export type ThemePreference = 'light' | 'dark' | 'system'

/** What `data-theme` is actually set to, and what global.css keys off. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: { id: ThemePreference; label: string; description: string }[] = [
  { id: 'light', label: 'Light', description: 'Always light, whatever the system is set to.' },
  { id: 'dark', label: 'Dark', description: 'Always dark, whatever the system is set to.' },
  { id: 'system', label: 'Follow OS', description: 'Match the system appearance, and switch with it.' }
]

const THEME_PREFERENCE_IDS = THEME_PREFERENCES.map((t) => t.id)

/** Coerce a stored/unknown value to a valid preference.
 *
 *  Absent falls back to 'system' — but note that this default only ever reaches a FRESH profile.
 *  Absence used to mean dark (the old store's initial value), so migration 039 writes an explicit
 *  'dark' into every database that existed before this release. Without that backfill this default
 *  would silently re-theme every existing user who never opened Settings. */
export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return THEME_PREFERENCE_IDS.includes(value as ThemePreference) ? (value as ThemePreference) : 'system'
}

/** Window background colors, matching --color-bg in global.css for each theme.
 *
 *  Deliberately duplicated from the stylesheet: main cannot read CSS custom properties, and
 *  BrowserWindow's `backgroundColor` has to be a literal at construction time. Keep in sync with
 *  the `--color-bg` declarations in src/renderer/src/styles/global.css. */
export const THEME_BACKGROUNDS: Record<ResolvedTheme, string> = {
  dark: '#14161a',
  light: '#f4f6f9'
}
