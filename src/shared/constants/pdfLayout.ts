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

export type PdfDateFormat = 'us' | 'us-long' | 'iso' | 'eu'

export const PDF_DATE_FORMATS: { value: PdfDateFormat; label: string }[] = [
  { value: 'us', label: 'MM/DD/YYYY (07/15/2026)' },
  { value: 'us-long', label: 'Month D, YYYY (July 15, 2026)' },
  { value: 'iso', label: 'YYYY-MM-DD (2026-07-15)' },
  { value: 'eu', label: 'DD/MM/YYYY (15/07/2026)' }
]

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/** Unset/garbage -> 'us', matching the native <input type="date">'s on-screen US-locale display
 *  (the field itself always stores/round-trips 'YYYY-MM-DD' regardless of display locale). */
export function parsePdfDateFormat(raw: string | null | undefined): PdfDateFormat {
  if (raw === 'us-long' || raw === 'iso' || raw === 'eu') return raw
  return 'us'
}

/** `iso` is a setup's stored session date, always 'YYYY-MM-DD'. Parsed by splitting the string
 *  directly rather than via `new Date(iso)` — that parses as UTC midnight, and formatting it back
 *  out in the runtime's local timezone can silently shift the date by a day. Malformed/legacy
 *  input is returned as-is rather than throwing. */
export function formatPdfDate(iso: string, format: PdfDateFormat): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, y, m, d] = match
  switch (format) {
    case 'us-long':
      return `${MONTH_NAMES[Number(m) - 1]} ${Number(d)}, ${y}`
    case 'eu':
      return `${d}/${m}/${y}`
    case 'iso':
      return `${y}-${m}-${d}`
    case 'us':
    default:
      return `${m}/${d}/${y}`
  }
}
