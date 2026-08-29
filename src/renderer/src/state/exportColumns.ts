import type { SetupItemDraft } from '@shared/types/setup'
import {
  COLUMN_LABELS,
  orderedVisibleColumns,
  type ExportColumnOverrides,
  type SetupColumnKey
} from '@shared/constants/setupColumns'

/** Why a column is off BY DEFAULT — a nudge toward why the export doesn't already carry it.
 *  'hidden' wins over 'empty': a column hidden in the editor is usually empty too, and "hidden"
 *  is the one the user can act on. */
export type ExportColumnOffReason = 'empty' | 'hidden'

export interface ExportColumnState {
  key: SetupColumnKey
  label: string
  /** Whether this column goes on the export — the default, unless the user flipped it. */
  on: boolean
  /** Set only for a chip that is off because of the DEFAULT (empty and/or hidden) — never for one
   *  the user switched off themselves, which is off by choice and needs no explanation. */
  reason: ExportColumnOffReason | null
  /** True when `on` differs from the computed default (i.e. an override is in play) — lets the
   *  chip row say so, and is what the flip logic uses to decide whether to drop the override. */
  overridden: boolean
}

/** Does any row put data in this column? Drives the default-on decision, so an export stops
 *  carrying six blank columns without the user having to say so — and starts carrying one the
 *  moment they fill it in. `stereoLink` never reaches here (it has no export representation);
 *  "Source name" isn't a SetupColumnKey at all and is always exported. */
function isColumnUsed(key: SetupColumnKey, items: SetupItemDraft[]): boolean {
  switch (key) {
    case 'mic':
      return items.some((i) => i.micId != null || !!i.micText?.trim())
    case 'preamp':
      return items.some((i) => i.preampId != null || !!i.preampText?.trim())
    case 'outboard':
      // One chip governs every outboard slot column, so any filled slot on any row counts.
      return items.some((i) => i.outboards.some((s) => s.outboardId != null || !!s.outboardText?.trim()))
    case 'phantomPower':
      return items.some((i) => i.phantomPower)
    case 'polarity':
      return items.some((i) => i.polarityFlip)
    case 'channel':
      return items.some((i) => i.channel != null)
    case 'tieLine':
      return items.some((i) => i.tieLine != null)
    case 'cueBox':
      return items.some((i) => !!i.cueBox?.trim())
    case 'notes':
      return items.some((i) => !!i.notes?.trim())
    case 'stereoLink':
      return false
  }
}

/** The chip row, in the setup's own column order.
 *
 *  Default per column: on iff it's visible in the editor AND some row uses it. The user's
 *  explicit flips live in `overrides` and only ever hold DEVIATIONS from that default — so a
 *  column the user never touched keeps following the data (fill in a blank column and its chip
 *  turns itself on next time the dialog opens).
 *
 *  Note the ordering source: `columnOrder` covers hidden columns too, so a hidden column still
 *  gets a chip (dashed, "hidden") in its proper place and can be exported without un-hiding it
 *  on screen. That's deliberate — un-hiding was the old "Show them" trap. */
export function computeExportColumnStates(
  items: SetupItemDraft[],
  columnOrder: SetupColumnKey[],
  visibleColumns: SetupColumnKey[],
  overrides: ExportColumnOverrides
): ExportColumnState[] {
  const visible = new Set(orderedVisibleColumns(columnOrder, visibleColumns))
  return columnOrder
    .filter((key) => key !== 'stereoLink')
    .map((key) => {
      const isVisible = visible.has(key)
      const used = isColumnUsed(key, items)
      const defaultOn = isVisible && used
      const override = overrides[key]
      const on = override ? override === 'show' : defaultOn
      return {
        key,
        label: COLUMN_LABELS[key],
        on,
        // A reason only ever explains a chip that is off BY DEFAULT. A column the user switched
        // off deliberately is off by choice, and labeling it — a Notes column with text in every
        // row, say — "empty" would state something plainly untrue about the sheet.
        reason: on || defaultOn ? null : !isVisible ? 'hidden' : 'empty',
        overridden: override != null && on !== defaultOn
      }
    })
}

/** Flip one chip, returning the next override map. An override that lands back ON the computed
 *  default is dropped rather than stored, so the column resumes tracking the sheet's data. */
export function toggleExportColumn(
  key: SetupColumnKey,
  states: ExportColumnState[],
  overrides: ExportColumnOverrides
): ExportColumnOverrides {
  const state = states.find((s) => s.key === key)
  if (!state) return overrides
  const nextOn = !state.on
  // Re-derive the default from the current state rather than recomputing from items: `on` is the
  // default exactly when no override is in play, and the inverse of it otherwise.
  const defaultOn = state.overridden ? !state.on : state.on
  const next = { ...overrides }
  if (nextOn === defaultOn) {
    delete next[key]
  } else {
    next[key] = nextOn ? 'show' : 'hide'
  }
  return next
}

/** The resolved column list handed to the exporters. Source name is implied (always leftmost,
 *  never a chip) and isn't in here. */
export function resolveIncludedColumns(states: ExportColumnState[]): SetupColumnKey[] {
  return states.filter((s) => s.on).map((s) => s.key)
}
