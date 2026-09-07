import { INSTRUMENT_TYPES } from './instrumentTypes'

export interface PaletteDefault {
  instrumentKey: string
  label: string
  shape: 'rect' | 'circle'
  color: string
  category: string
  defaultWidth: number | null
  defaultHeight: number | null
}

/** The palette exactly as a fresh install ends up with it, and the target "Reset to defaults"
 *  restores. Array order IS the default sort order.
 *
 *  This is deliberately not the same thing as INSTRUMENT_TYPES. That array is the frozen seed for
 *  migration 012 and stops at the seventeen original instruments; the shipped default palette is
 *  that list plus everything later migrations added, with their corrections applied. Today that
 *  means the gobo (028), folded into the existing Utility category and given its long thin placed
 *  size (029, 030). The seventeen instruments carry no default size, so they drop in at the
 *  standard square.
 *
 *  INSTRUMENT_TYPES already holds the post-016 swatch colors (016 updated it in lockstep), so
 *  spreading it here is correct rather than a coincidence.
 *
 *  **Keep this in step**: a future migration that adds a built-in, or changes a built-in's default
 *  color, label, category or size, has to be reflected here too, or reset will hand back a palette
 *  that no fresh install has ever had.
 */
export const DEFAULT_PALETTE_ITEMS: PaletteDefault[] = [
  ...INSTRUMENT_TYPES.map((instrument) => ({
    instrumentKey: instrument.id,
    label: instrument.label,
    shape: instrument.shape,
    color: instrument.color,
    category: instrument.category,
    defaultWidth: null,
    defaultHeight: null
  })),
  {
    instrumentKey: 'gobo',
    label: 'Gobo',
    shape: 'rect',
    color: '#94a3b8',
    category: 'Utility',
    defaultWidth: 120,
    defaultHeight: 30
  }
]
