import { useMemo } from 'react'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import {
  computeExportColumnStates,
  resolveIncludedColumns,
  toggleExportColumn,
  type ExportColumnOffReason,
  type ExportColumnState
} from '@renderer/state/exportColumns'
import type { SetupColumnKey } from '@shared/constants/setupColumns'

const REASON_LABEL: Record<ExportColumnOffReason, string> = {
  empty: 'empty',
  hidden: 'hidden'
}

export interface ExportColumnChipsController {
  states: ExportColumnState[]
  /** The resolved list to hand the exporter (Source name implied, so not in here). */
  included: SetupColumnKey[]
  toggle: (key: SetupColumnKey) => void
}

/** Wires the chip row to the setup store — read through the context hook rather than the
 *  singleton, so Split View's second pane exports its OWN columns (safe: both export modals
 *  render inside the pane that opened them).
 *
 *  Defaults recompute from live store data every time a dialog mounts, so a column filled in
 *  since the last export turns its own chip back on by itself. Only the user's explicit flips
 *  persist, and only while they deviate from the default. Call this in the dialog (it needs
 *  `included` at export time) and pass the rest to the component below. */
export function useExportColumnChips(): ExportColumnChipsController {
  const items = useSetupStoreState((s) => s.items)
  const columnOrder = useSetupStoreState((s) => s.columnOrder)
  const visibleColumns = useSetupStoreState((s) => s.visibleColumns)
  const overrides = useSetupStoreState((s) => s.exportColumnOverrides)
  const setExportColumnOverrides = useSetupStoreState((s) => s.setExportColumnOverrides)

  const states = useMemo(
    () => computeExportColumnStates(items, columnOrder, visibleColumns, overrides),
    [items, columnOrder, visibleColumns, overrides]
  )

  return {
    states,
    included: useMemo(() => resolveIncludedColumns(states), [states]),
    toggle: (key) => setExportColumnOverrides(toggleExportColumn(key, states, overrides))
  }
}

/** The per-column export chips, shared by the PDF and spreadsheet export dialogs — one notion of
 *  "what belongs on an export of this sheet", remembered per setup. Filled = going on the export;
 *  dashed with a reason = left off. */
export default function ExportColumnChips({
  states,
  onToggle
}: {
  states: ExportColumnState[]
  onToggle: (key: SetupColumnKey) => void
}): JSX.Element {
  const onCount = states.filter((s) => s.on).length

  return (
    <div className="export-column-section">
      <div className="export-column-section-head">
        <span className="export-column-section-title">Columns to export</span>
        <span className="export-column-section-count">
          {onCount} of {states.length}
        </span>
      </div>
      <div className="export-column-chips">
        {states.map((state) => (
          <button
            key={state.key}
            type="button"
            className="export-column-chip"
            data-on={state.on ? 'true' : 'false'}
            onClick={() => onToggle(state.key)}
            aria-pressed={state.on}
            title={
              state.on
                ? `${state.label} will be included — click to leave it out`
                : `${state.label} is ${REASON_LABEL[state.reason ?? 'empty']} — click to include it anyway`
            }
          >
            {state.label}
            {state.reason && <span className="export-column-chip-reason"> · {REASON_LABEL[state.reason]}</span>}
          </button>
        ))}
      </div>
      <p className="export-column-hint">
        Click a chip to add or remove it. Source name is always included.
      </p>
    </div>
  )
}
