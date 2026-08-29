import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ExportColumnChips, { useExportColumnChips } from '@renderer/components/ExportColumnChips'
import type { SetupColumnKey } from '@shared/constants/setupColumns'

interface Props {
  onClose: () => void
  onExport: (includeColumns: SetupColumnKey[]) => Promise<void>
}

/** The spreadsheet export's one decision: which columns go in the file. Deliberately much smaller
 *  than ExportOptionsModal — a spreadsheet has no orientation/density/include-style choices — and
 *  Export is autofocused so Cmd/Ctrl+Shift+E → Enter is still a two-keystroke export. */
export default function SpreadsheetExportModal({ onClose, onExport }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const chips = useExportColumnChips()
  const [exporting, setExporting] = useState(false)

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      await onExport(chips.included)
      onClose()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h2 style={{ marginTop: 0 }}>Export to Spreadsheet</h2>
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
