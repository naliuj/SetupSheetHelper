import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import ExportColumnChips, { useExportColumnChips } from '@renderer/components/ExportColumnChips'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import { useModalDialog } from '@renderer/hooks/useModalDialog'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import { usePdfLayoutPrefsStore } from '@renderer/state/pdfLayoutPrefsStore'
import { hasBands } from '@shared/utils/bands'
import type { BandExportLayout } from '@shared/types/ipc'

interface Props {
  /** Whether this setup resolves to a room layout at all — the toggle is only worth offering when
   *  there is something to put on the sheet. Same gate ExportOptionsModal uses. */
  hasLayout: boolean
  defaultIncludeLayout: boolean
  /** Whether the setup's studio has a patchbay drawing, gating the "Patchbay" toggle the same way. */
  hasPatchbay: boolean
  defaultIncludePatchbay: boolean
  onClose: () => void
  onExport: (
    includeColumns: SetupColumnKey[],
    includeLayout: boolean,
    includePatchbay: boolean,
    /** Only set when the setup has bands. */
    bandLayout?: BandExportLayout
  ) => Promise<void>
}

/** The spreadsheet export's decisions: which columns go in the file, and whether to append the
 *  room layout as a picture and the patchbay as a sheet of its own. Deliberately much smaller than ExportOptionsModal — a spreadsheet has
 *  no orientation/density choices — and Export is autofocused so Cmd/Ctrl+Shift+E → Enter is still
 *  a two-keystroke export. */
export default function SpreadsheetExportModal({
  hasLayout,
  defaultIncludeLayout,
  hasPatchbay,
  defaultIncludePatchbay,
  onClose,
  onExport
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const chips = useExportColumnChips()
  const [exporting, setExporting] = useState(false)
  const [includeLayout, setIncludeLayout] = useState(hasLayout && defaultIncludeLayout)
  const [includePatchbay, setIncludePatchbay] = useState(hasPatchbay && defaultIncludePatchbay)
  const sheetHasBands = useSetupStoreState((s) => hasBands(s.items))
  const [bandLayout, setBandLayout] = useState(usePdfLayoutPrefsStore.getState().bandExportLayout)
  const [markBandChanges, setMarkBandChanges] = useState(usePdfLayoutPrefsStore.getState().markBandChanges)

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      // Saved first: SetupToolbar reads this pref when it builds the export.
      if (sheetHasBands) await usePdfLayoutPrefsStore.getState().setMarkBandChanges(markBandChanges)
      await onExport(chips.included, includeLayout, includePatchbay, sheetHasBands ? bandLayout : undefined)
      if (sheetHasBands) await usePdfLayoutPrefsStore.getState().setBandExportLayout(bandLayout)
      onClose()
    } finally {
      setExporting(false)
    }
  }

  const dialog = useModalDialog('Export to Spreadsheet')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h2 style={{ marginTop: 0 }}>Export to Spreadsheet</h2>
        {hasLayout && (
          <div style={{ marginBottom: 10 }}>
            <ToggleSwitch checked={includeLayout} onChange={setIncludeLayout} label="Room layout" />
            <p className="card-sub" style={{ margin: '4px 0 0 24px' }}>
              Adds the room layout as a picture on a second sheet. It is an image, not data.
            </p>
          </div>
        )}
        {hasPatchbay && (
          <div style={{ marginBottom: 10 }}>
            <ToggleSwitch checked={includePatchbay} onChange={setIncludePatchbay} label="Patchbay" />
            <p className="card-sub" style={{ margin: '4px 0 0 24px' }}>
              Adds a sheet listing the patch cables, with the patchbay drawing as a picture below.
            </p>
          </div>
        )}
        {sheetHasBands && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            <span className="card-sub" style={{ margin: 0 }}>Bands</span>
            <select value={bandLayout} onChange={(e) => setBandLayout(e.target.value as BandExportLayout)}>
              <option value="continuous">Continuous</option>
              <option value="pagePerBand">A sheet per band</option>
            </select>
          </label>
        )}
        {sheetHasBands && (
          <div style={{ marginBottom: 10 }}>
            <ToggleSwitch checked={markBandChanges} onChange={setMarkBandChanges} label="Mark changes between bands" />
          </div>
        )}
        <ExportColumnChips states={chips.states} onToggle={chips.toggle} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleExport}
            disabled={exporting || chips.included.length === 0}
            autoFocus
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
