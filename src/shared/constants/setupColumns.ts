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

/** key → on-screen label, derived from TOGGLEABLE_COLUMNS so the table header and the Columns
 *  menu can't drift apart. (The PDF export deliberately keeps its own longer labels — "Microphone",
 *  "Tie Line" — sized for print, so it isn't a consumer of this.) */
export const COLUMN_LABELS: Record<SetupColumnKey, string> = Object.fromEntries(
  TOGGLEABLE_COLUMNS.map((c) => [c.key, c.label])
) as Record<SetupColumnKey, string>

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

// Column ORDER is stored separately from column VISIBILITY, and deliberately covers every key
// (hidden ones included) rather than just the visible ones. That's what lets hiding a column and
// re-showing it later put it back where the user dragged it, instead of dumping it at the end —
// and it's why the two concepts don't share a field. `visible_columns` above stays a set (its
// canonical-order normalization is correct for a set); this is the list that carries order.
// Render order is `columnOrder.filter((k) => visibleSet.has(k))`.

/** The columns that can't be dragged: `stereoLink` draws an absolutely-positioned pair bracket and
 *  seam button that only read correctly at the row's left edge, so it stays pinned leftmost (it's
 *  still toggleable). "Source name" isn't in SetupColumnKey at all — it's always shown, always
 *  second. Both render as locked rows in the reorder UI. */
export const PINNED_COLUMN_KEYS: SetupColumnKey[] = ['stereoLink']

/** Parse a stored `column_order` value (JSON array of keys) into a concrete full ordering.
 *  `null`/unset/garbage → canonical order, so pre-feature setups are unaffected. Defensive about
 *  stored content: unknown keys are dropped, duplicates collapsed, and any key missing from the
 *  stored order is appended in canonical order — so a column added to the app in a later version
 *  still appears for users who saved an order before it existed. */
export function parseColumnOrder(raw: string | null | undefined): SetupColumnKey[] {
  if (!raw) return [...ALL_COLUMN_KEYS]
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return [...ALL_COLUMN_KEYS]
    const seen = new Set<SetupColumnKey>()
    const known: SetupColumnKey[] = []
    for (const k of arr) {
      if (ALL_COLUMN_KEYS.includes(k as SetupColumnKey) && !seen.has(k as SetupColumnKey)) {
        seen.add(k as SetupColumnKey)
        known.push(k as SetupColumnKey)
      }
    }
    return [...known, ...ALL_COLUMN_KEYS.filter((k) => !seen.has(k))]
  } catch {
    return [...ALL_COLUMN_KEYS]
  }
}

/** Serialize a column order for storage. Unlike serializeVisibleColumns this must NOT normalize —
 *  the caller's order is the whole point. Runs through parseColumnOrder's repair logic first so a
 *  partial/dirty list still round-trips as a complete, valid ordering. */
export function serializeColumnOrder(keys: SetupColumnKey[]): string {
  return JSON.stringify(parseColumnOrder(JSON.stringify(keys)))
}

/** The visible columns in the user's chosen order — the single helper every renderer and exporter
 *  should use, so the on-screen table, the PDF, and the spreadsheet can't drift apart. */
export function orderedVisibleColumns(
  columnOrder: SetupColumnKey[],
  visibleColumns: SetupColumnKey[]
): SetupColumnKey[] {
  const visible = new Set(visibleColumns)
  return parseColumnOrder(JSON.stringify(columnOrder)).filter((k) => visible.has(k))
}
