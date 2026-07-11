export interface InstrumentTypeDef {
  id: string
  label: string
  shape: 'rect' | 'circle'
  color: string
  category: string
}

/** Historical/seed-only: this is the one-time seed source for the palette_items DB table (see
 *  migration 012_palette_items.ts). The live, user-editable palette is now driven by
 *  usePaletteStore/palette_items — this array is frozen and no longer read by the UI directly.
 *  Circle = hand-held/body-carried performer instrument; rect = equipment footprint (this
 *  convention still applies to the seed data, just no longer to live palette editing). */
export const INSTRUMENT_TYPES: InstrumentTypeDef[] = [
  { id: 'vocal_mic', label: 'Vocal Mic', shape: 'circle', color: '#f87171', category: 'Vocals' },
  { id: 'talkback_mic', label: 'Talkback Mic', shape: 'circle', color: '#f87171', category: 'Vocals' },
  { id: 'drums', label: 'Drums', shape: 'rect', color: '#64748b', category: 'Drums' },
  { id: 'guitar_amp', label: 'Guitar Amp', shape: 'rect', color: '#f59e0b', category: 'Amps' },
  { id: 'bass_amp', label: 'Bass Amp', shape: 'rect', color: '#f59e0b', category: 'Amps' },
  { id: 'keys', label: 'Keys', shape: 'rect', color: '#a855f7', category: 'Keys' },
  { id: 'piano', label: 'Piano', shape: 'rect', color: '#a855f7', category: 'Keys' },
  { id: 'di_box', label: 'DI Box', shape: 'rect', color: '#14b8a6', category: 'Utility' },
  { id: 'reamp_box', label: 'Re-amp Box', shape: 'rect', color: '#14b8a6', category: 'Utility' },
  { id: 'trumpet', label: 'Trumpet', shape: 'circle', color: '#fb923c', category: 'Horn Section' },
  { id: 'trombone', label: 'Trombone', shape: 'circle', color: '#fb923c', category: 'Horn Section' },
  { id: 'alto_sax', label: 'Alto Sax', shape: 'circle', color: '#fb923c', category: 'Horn Section' },
  { id: 'tenor_sax', label: 'Tenor Sax', shape: 'circle', color: '#fb923c', category: 'Horn Section' },
  { id: 'violin', label: 'Violin', shape: 'circle', color: '#22c55e', category: 'String Section' },
  { id: 'viola', label: 'Viola', shape: 'circle', color: '#22c55e', category: 'String Section' },
  { id: 'cello', label: 'Cello', shape: 'circle', color: '#22c55e', category: 'String Section' },
  { id: 'upright_bass', label: 'Upright Bass', shape: 'circle', color: '#22c55e', category: 'String Section' }
]
