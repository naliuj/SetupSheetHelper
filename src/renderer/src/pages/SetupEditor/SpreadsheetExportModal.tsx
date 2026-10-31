import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import ExportColumnChips, { useExportColumnChips } from '@renderer/components/ExportColumnChips'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import { useModalDialog } from '@renderer/hooks/useModalDialog'

interface Props {
  /** Whether this setup resolves to a room layout at all — the toggle is only worth offering when
   *  there is something to put on the sheet. Same gate ExportOptionsModal uses. */
  hasLayout: boolean
  defaultIncludeLayout: boolean
  /** Whether the setup's studio has a patchbay drawing, gating the "Patchbay" toggle the same way. */
  hasPatchbay: boolean
  defaultIncludePatchbay: boolean
  onClose: () => void
  onExport: (includeColumns: SetupColumnKey[], includeLayout: boolean, includePatchbay: boolean) => Promise<void>
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

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      await onExport(chips.included, includeLayout, includePatchbay)
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
