// The setup-sheet table columns the user can show/hide. "Source name" is always shown (a sheet
// needs a source) and is deliberately not in this list. These keys are shared by the on-screen
// table, the per-setup Columns popover, the global default in Settings, and the PDF export.

export type SetupColumnKey =
  | 'stereoLink'
  | 'mic'
  | 'phantomPower'
  | 'outboard'
  | 'channel'
  | 'preamp'
  | 'tieLine'
  | 'cueBox'
  | 'polarity'
  | 'notes'

export const TOGGLEABLE_COLUMNS: { key: SetupColumnKey; label: string }[] = [
  // The slim leftmost stereo-pair link column — a control column, but toggleable like the rest so
  // rock setups (no stereo pairs) can hide it. On for new/unconfigured setups (it's in ALL_COLUMN_KEYS).
  { key: 'stereoLink', label: 'Stereo Link' },
  { key: 'mic', label: 'Mic' },
  { key: 'phantomPower', label: '48V' },
  { key: 'outboard', label: 'Outboard' },
  { key: 'channel', label: 'Channel' },
  { key: 'preamp', label: 'Preamp' },
  { key: 'tieLine', label: 'Tie line' },
  { key: 'cueBox', label: 'Cue box' },
  { key: 'polarity', label: 'Polarity' },
  { key: 'notes', label: 'Notes' }
]

export const ALL_COLUMN_KEYS: SetupColumnKey[] = TOGGLEABLE_COLUMNS.map((c) => c.key)

/** Parse a stored `visible_columns` value (JSON array of keys) into a concrete, order-normalized
 *  list. `null`/unset/garbage → every column visible, so pre-feature setups (and a never-configured
 *  global default) keep today's behavior of showing everything. */
export function parseVisibleColumns(raw: string | null | undefined): SetupColumnKey[] {
  if (!raw) return [...ALL_COLUMN_KEYS]
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return [...ALL_COLUMN_KEYS]
    return ALL_COLUMN_KEYS.filter((k) => arr.includes(k))
  } catch {
    return [...ALL_COLUMN_KEYS]
  }
}

/** Serialize a visible-columns list for storage (kept in canonical order). */
export function serializeVisibleColumns(keys: SetupColumnKey[]): string {
  return JSON.stringify(ALL_COLUMN_KEYS.filter((k) => keys.includes(k)))
}
