// The fixed color palette used everywhere the user picks a color (layout blocks, palette items,
// setup-sheet row tints). Deliberately small and stable — 10 hues, each in five shades — so the
// user can reliably find the same color again, unlike a free-form OS color picker.

export interface SwatchGroup {
  name: string
  lightest: string
  light: string
  base: string
  dark: string
  darkest: string
}

// light/base/dark keep their original values from the 3-shade palette (so anything already
// saved with one of those hexes still highlights correctly in the grid) — lightest/darkest are
// new outer steps in the same ramp.
export const COLOR_SWATCHES: SwatchGroup[] = [
  { name: 'Slate', lightest: '#e2e8f0', light: '#94a3b8', base: '#64748b', dark: '#475569', darkest: '#0f172a' },
  { name: 'Red', lightest: '#fecaca', light: '#f87171', base: '#ef4444', dark: '#b91c1c', darkest: '#7f1d1d' },
  { name: 'Orange', lightest: '#fed7aa', light: '#fb923c', base: '#f97316', dark: '#c2410c', darkest: '#7c2d12' },
  { name: 'Amber', lightest: '#fde68a', light: '#fcd34d', base: '#f59e0b', dark: '#b45309', darkest: '#78350f' },
  { name: 'Green', lightest: '#bbf7d0', light: '#86efac', base: '#22c55e', dark: '#15803d', darkest: '#14532d' },
  { name: 'Teal', lightest: '#99f6e4', light: '#5eead4', base: '#14b8a6', dark: '#0f766e', darkest: '#134e4a' },
  { name: 'Blue', lightest: '#bfdbfe', light: '#60a5fa', base: '#3b82f6', dark: '#1d4ed8', darkest: '#1e3a8a' },
  { name: 'Indigo', lightest: '#c7d2fe', light: '#818cf8', base: '#6366f1', dark: '#4338ca', darkest: '#312e81' },
  { name: 'Purple', lightest: '#e9d5ff', light: '#c084fc', base: '#a855f7', dark: '#7e22ce', darkest: '#581c87' },
  { name: 'Pink', lightest: '#fbcfe8', light: '#f472b6', base: '#ec4899', dark: '#be185d', darkest: '#831843' }
]

/** The default color for a newly created block/palette item (was the old free-form `#6c7ba0`). */
export const DEFAULT_SWATCH = COLOR_SWATCHES[0].base

/** Every swatch hex in one flat list (one entry per shade row), for membership checks. */
export const ALL_SWATCH_HEXES: string[] = COLOR_SWATCHES.flatMap((g) => [
  g.lightest,
  g.light,
  g.base,
  g.dark,
  g.darkest
])

/** Picks black or white text for legibility on a solid color fill, via relative luminance — so a
 *  light-shade fill (e.g. light amber) gets dark text instead of unreadable white. */
export function readableTextColor(hex: string): '#ffffff' | '#1a1d23' {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const toLinear = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.5 ? '#1a1d23' : '#ffffff'
}
