import { COLOR_SWATCHES } from './swatches'

const swatch = (name: string): string => COLOR_SWATCHES.find((g) => g.name === name)?.base ?? '#64748b'

/** The cable colors on offer — the usual patch-cable colors, drawn from the app's swatches. */
export const CABLE_COLORS: { name: string; hex: string }[] = [
  { name: 'Red', hex: swatch('Red') },
  { name: 'Blue', hex: swatch('Blue') },
  { name: 'Green', hex: swatch('Green') },
  {
    name: 'Yellow',
    hex: COLOR_SWATCHES.find((g) => g.name === 'Amber')?.light ?? '#fcd34d'
  },
  { name: 'Orange', hex: swatch('Orange') },
  { name: 'Purple', hex: swatch('Purple') },
  { name: 'Black', hex: '#1a1d23' },
  { name: 'Gray', hex: swatch('Slate') },
  { name: 'White', hex: '#f8fafc' }
]

export const DEFAULT_CABLE_COLOR = CABLE_COLORS[0].hex

/** 0 = taut, 1 = a heavy droop. */
export const DEFAULT_CABLE_SAG = 0.35

export function cableColorName(hex: string): string {
  return CABLE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex
}
