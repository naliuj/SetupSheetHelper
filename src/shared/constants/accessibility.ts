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

/** UI scale, as a Chromium zoom factor applied to every window's webContents.
 *
 *  Zoom rather than a font-size token because the stylesheet has no `rem` anywhere and no base
 *  font-size — 266 hardcoded px values, with type down to 11px. setZoomFactor scales px too, so
 *  this reaches all of it without a px-to-rem conversion first.
 *
 *  Steps rather than a free slider so the menu's Zoom In/Out have something to walk, and so the
 *  stored value is always one the Settings picker can show. Includes two steps below 100% because
 *  Electron's stock View menu (which this replaces) could zoom out, and dropping that would be a
 *  regression. */
export const UI_SCALES: { factor: number; label: string }[] = [
  { factor: 0.8, label: '80%' },
  { factor: 0.9, label: '90%' },
  { factor: 1, label: '100%' },
  { factor: 1.1, label: '110%' },
  { factor: 1.25, label: '125%' },
  { factor: 1.5, label: '150%' },
  { factor: 1.75, label: '175%' },
  { factor: 2, label: '200%' }
]

export const DEFAULT_UI_SCALE = 1

/** Coerce a stored/unknown value to one of the steps above.
 *
 *  Snaps to the nearest step rather than rejecting near-misses, so a value written by an older or
 *  newer build (or a hand-edited database) lands somewhere sensible instead of silently jumping
 *  back to 100%. Unparseable or absent → 100%. */
export function parseUiScale(value: string | null | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UI_SCALE
  return UI_SCALES.reduce((best, s) =>
    Math.abs(s.factor - parsed) < Math.abs(best.factor - parsed) ? s : best
  ).factor
}

export function serializeUiScale(factor: number): string {
  return String(factor)
}

/** The next step up or down from `factor`, clamped at the ends — what the View menu's Zoom In and
 *  Zoom Out walk. Returns the same value at the ends so the caller can skip a redundant write. */
export function steppedUiScale(factor: number, direction: 'in' | 'out'): number {
  const index = UI_SCALES.findIndex((s) => s.factor === parseUiScale(String(factor)))
  const next = direction === 'in' ? index + 1 : index - 1
  return UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, next))].factor
}
