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
  { id: 'vocal_mic', label: 'Vocal Mic', shape: 'circle', color: '#e6738f', category: 'Vocals' },
  { id: 'talkback_mic', label: 'Talkback Mic', shape: 'circle', color: '#e6738f', category: 'Vocals' },
  { id: 'drums', label: 'Drums', shape: 'rect', color: '#4f7cac', category: 'Drums' },
  { id: 'guitar_amp', label: 'Guitar Amp', shape: 'rect', color: '#f2a541', category: 'Amps' },
  { id: 'bass_amp', label: 'Bass Amp', shape: 'rect', color: '#f2a541', category: 'Amps' },
  { id: 'keys', label: 'Keys', shape: 'rect', color: '#8a6fbf', category: 'Keys' },
  { id: 'piano', label: 'Piano', shape: 'rect', color: '#8a6fbf', category: 'Keys' },
  { id: 'di_box', label: 'DI Box', shape: 'rect', color: '#5fb49c', category: 'Utility' },
  { id: 'reamp_box', label: 'Re-amp Box', shape: 'rect', color: '#5fb49c', category: 'Utility' },
  { id: 'trumpet', label: 'Trumpet', shape: 'circle', color: '#d98c3f', category: 'Horn Section' },
  { id: 'trombone', label: 'Trombone', shape: 'circle', color: '#d98c3f', category: 'Horn Section' },
  { id: 'alto_sax', label: 'Alto Sax', shape: 'circle', color: '#d98c3f', category: 'Horn Section' },
  { id: 'tenor_sax', label: 'Tenor Sax', shape: 'circle', color: '#d98c3f', category: 'Horn Section' },
  { id: 'violin', label: 'Violin', shape: 'circle', color: '#7a9e5f', category: 'String Section' },
  { id: 'viola', label: 'Viola', shape: 'circle', color: '#7a9e5f', category: 'String Section' },
  { id: 'cello', label: 'Cello', shape: 'circle', color: '#7a9e5f', category: 'String Section' },
  { id: 'upright_bass', label: 'Upright Bass', shape: 'circle', color: '#7a9e5f', category: 'String Section' }
]
