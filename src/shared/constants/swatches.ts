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

/** The palette's own name for a hex, e.g. "Amber dark" — or null for a color that is not one of
 *  the swatches (an imported .json can carry anything).
 *
 *  Exists because a row's color is the one place in the app where color carries meaning on its own:
 *  Layout Mode blocks always draw a text label and use shape as well as hue, warnings pair an icon
 *  with text, and phantom power is a checkbox — but a tinted row is a background and nothing else.
 *  That is invisible to a screen reader, and for the ~8% of men with red-green color blindness the
 *  ten hues collapse to about four distinguishable groups, four of which (Red, Orange, Amber,
 *  Green) sit in the band that collapses. The picker already builds this string for its own
 *  buttons; this makes the same name available where the color is USED. */
export function swatchName(hex: string | null | undefined): string | null {
  if (!isHexColor(hex)) return null
  const target = hex.toLowerCase()
  for (const group of COLOR_SWATCHES) {
    for (const shade of ['lightest', 'light', 'base', 'dark', 'darkest'] as const) {
      if (group[shade].toLowerCase() === target) return `${group.name} ${shade}`
    }
  }
  return null
}

/** Every swatch hex in one flat list (one entry per shade row), for membership checks. */
export const ALL_SWATCH_HEXES: string[] = COLOR_SWATCHES.flatMap((g) => [
  g.lightest,
  g.light,
  g.base,
  g.dark,
  g.darkest
])

/** #rgb / #rrggbb only — the same shape parsePdfAccentColor enforces for the PDF accent.
 *
 *  A row's color normally comes from the swatch grid above, but exportImport.ts passes item.color
 *  straight through from an imported .json, so it is untrusted. Both exports care: pdf-lib's rgb()
 *  THROWS on the NaN a malformed value parses to, aborting the whole export with no file written,
 *  and exceljs silently writes it into xl/styles.xml as an invalid ARGB that Excel then offers to
 *  repair. */
export function isHexColor(hex: string | null | undefined): hex is string {
  return !!hex && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)
}

/** WCAG 2.x relative luminance of a #rgb / #rrggbb color. Exported because the contrast checks
 *  built on it (readableTextColor below, the label-color warning in the text-color picker) all
 *  need the same number, and a second copy of this math is exactly how the thresholds drift. */
export function relativeLuminance(hex: string): number {
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
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG contrast ratio between two colors, 1:1 (identical) to 21:1 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** The two colors readableTextColor chooses between. */
const TEXT_ON_FILL_LIGHT = '#ffffff' as const
const TEXT_ON_FILL_DARK = '#1a1d23' as const

/** The fill luminance where white and dark text score the SAME contrast ratio — so it is the point
 *  at which the better choice flips. Solving
 *
 *    1.05 / (L + 0.05)  ===  (L + 0.05) / (Ldark + 0.05)
 *
 *  for L gives sqrt(1.05 * (Ldark + 0.05)) - 0.05, ≈ 0.208 for #1a1d23. Derived rather than
 *  hardcoded so it stays correct if TEXT_ON_FILL_DARK is ever retuned.
 *
 *  This was a flat 0.5 until the accessibility audit: 0.5 is the midpoint of the luminance RANGE,
 *  but luminance is heavily bottom-weighted, so it sits nowhere near the midpoint of the contrast
 *  curve. 16 of the 50 swatches got white text where dark text was strictly better, 13 of them
 *  failing WCAG AA outright — worst was Amber base #f59e0b at 2.15:1, which dark text takes to
 *  7.86:1. Three base shades (#ef4444, #6366f1, #a855f7) cannot reach 4.5:1 against either color
 *  and top out at ~4.3-4.5:1; they are deliberately left as-is rather than retuned, because these
 *  hexes are already stored in user data. */
const TEXT_FLIP_LUMINANCE = Math.sqrt(1.05 * (relativeLuminance(TEXT_ON_FILL_DARK) + 0.05)) - 0.05

/** Picks black or white text for legibility on a solid color fill, via relative luminance — so a
 *  light-shade fill (e.g. light amber) gets dark text instead of unreadable white. */
export function readableTextColor(hex: string): '#ffffff' | '#1a1d23' {
  return relativeLuminance(hex) > TEXT_FLIP_LUMINANCE ? TEXT_ON_FILL_DARK : TEXT_ON_FILL_LIGHT
}

/** The two text colors people reach for first, offered ahead of the swatch grid in the block
 *  text-color picker. Neither is in COLOR_SWATCHES — its nearest are Slate lightest and darkest,
 *  which aren't quite white or black — so they are listed here rather than added to the grid,
 *  where they would also turn up as row and block fill choices. */
export const LABEL_TEXT_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#000000', name: 'Black' }
]

/** A Layout Mode block's label color: the user's pick when there is a valid one, otherwise the
 *  automatic black-or-white choice for the block's fill. null means Auto.
 *
 *  Validated here, at the point of use, because nothing validates block colors on the way in —
 *  and an unparseable value would otherwise reach Konva as a fill it cannot draw. */
export function resolveLabelColor(fill: string, labelColor: string | null | undefined): string {
  return isHexColor(labelColor) ? labelColor : readableTextColor(fill)
}

/** The shadow that keeps a label legible over a busy floor plan: dark behind light text, light
 *  behind dark text. Decided from the TEXT color's own luminance, so it works for any color — and
 *  for the two automatic colors it gives exactly the shadow the canvas has always used. */
export function labelShadowFor(textColor: string): '#ffffff' | '#000000' {
  return readableTextColor(textColor) === '#ffffff' ? '#ffffff' : '#000000'
}
