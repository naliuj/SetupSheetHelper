// Style preferences for the PDF setup-sheet export. These are global, persistent settings (see
// APP_SETTINGS_KEYS.pdf*) rather than per-export options — set once in Settings > PDF Layout,
// applied to every export. Pure module (no pdf-lib/electron/db deps) so both the renderer store
// and the main-process PDF generator can import it.

export type PdfGridStyle = 'none' | 'full' | 'rows' | 'outer'

export const PDF_GRID_STYLES: { value: PdfGridStyle; label: string }[] = [
  { value: 'none', label: 'None (header underline only)' },
  { value: 'full', label: 'Full grid (every cell)' },
  { value: 'rows', label: 'Row lines only' },
  { value: 'outer', label: 'Outer border only' }
]

/** Unset/garbage -> 'full', the default grid style for setups that haven't configured this. */
export function parsePdfGridStyle(raw: string | null | undefined): PdfGridStyle {
  if (raw === 'none' || raw === 'rows' || raw === 'outer') return raw
  return 'full'
}

/** Unset/blank/malformed -> null (no accent tint anywhere in the export). */
export function parsePdfAccentColor(raw: string | null | undefined): string | null {
  if (!raw) return null
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null
}

export function parsePdfBoolSetting(raw: string | null | undefined): boolean {
  return raw === '1'
}

export function serializePdfBoolSetting(value: boolean): string {
  return value ? '1' : '0'
}
