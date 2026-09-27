/** Accessibility preferences (Settings → Accessibility), each stored as a single app-setting
 *  string. Kept beside theme.ts rather than inside it because these are orthogonal to light/dark —
 *  a user can want increased contrast in either theme. */

/** How much contrast to draw UI boundaries — table cell borders, dividers, control outlines — at.
 *
 *  Three-way rather than a plain toggle, deliberately mirroring ThemePreference: macOS has its own
 *  "Increase contrast" switch in System Settings → Accessibility, and a user who has turned that on
 *  expects apps to follow it without being asked twice. A bare on/off would either ignore the OS or
 *  silently disagree with its own label ("off" while the OS forces it on). */
export type ContrastPreference = 'system' | 'more' | 'standard'

export const CONTRAST_PREFERENCES: { id: ContrastPreference; label: string; description: string }[] = [
  {
    id: 'system',
    label: 'Follow OS',
    description: "Match the system's Increase Contrast setting, and switch with it."
  },
  { id: 'more', label: 'Increased', description: 'Always draw stronger borders and dividers.' },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Always the default borders, whatever the system is set to.'
  }
]

const CONTRAST_PREFERENCE_IDS = CONTRAST_PREFERENCES.map((c) => c.id)

/** Coerce a stored/unknown value to a valid preference; anything unrecognized follows the OS.
 *
 *  Unlike theme, absence genuinely means "fresh or never touched" — there is no older default to
 *  preserve, so no backfill migration is needed. Following the OS is also the safest default for a
 *  user who already asked for more contrast system-wide. */
export function parseContrastPreference(value: string | null | undefined): ContrastPreference {
  return CONTRAST_PREFERENCE_IDS.includes(value as ContrastPreference)
    ? (value as ContrastPreference)
    : 'system'
}
