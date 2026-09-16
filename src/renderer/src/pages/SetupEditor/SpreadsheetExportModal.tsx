import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import ExportColumnChips, { useExportColumnChips } from '@renderer/components/ExportColumnChips'
import type { SetupColumnKey } from '@shared/constants/setupColumns'

interface Props {
  /** Whether this setup resolves to a room layout at all — the toggle is only worth offering when
   *  there is something to put on the sheet. Same gate ExportOptionsModal uses. */
  hasLayout: boolean
  defaultIncludeLayout: boolean
  onClose: () => void
  onExport: (includeColumns: SetupColumnKey[], includeLayout: boolean) => Promise<void>
}

/** The spreadsheet export's decisions: which columns go in the file, and whether to append the
 *  room layout as a picture. Deliberately much smaller than ExportOptionsModal — a spreadsheet has
 *  no orientation/density choices — and Export is autofocused so Cmd/Ctrl+Shift+E → Enter is still
 *  a two-keystroke export. */
export default function SpreadsheetExportModal({
  hasLayout,
  defaultIncludeLayout,
  onClose,
  onExport
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const chips = useExportColumnChips()
  const [exporting, setExporting] = useState(false)
  const [includeLayout, setIncludeLayout] = useState(hasLayout && defaultIncludeLayout)

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      await onExport(chips.included, includeLayout)
      onClose()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h2 style={{ marginTop: 0 }}>Export to Spreadsheet</h2>
        {hasLayout && (
          <div style={{ marginBottom: 10 }}>
            <ToggleSwitch checked={includeLayout} onChange={setIncludeLayout} label="Room layout" />
            <p className="card-sub" style={{ margin: '4px 0 0 24px' }}>
              Adds the room layout as a picture on a second sheet. It is an image, not data.
            </p>
          </div>
        )}
        <ExportColumnChips states={chips.states} onToggle={chips.toggle} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleExport} disabled={exporting} autoFocus>
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
