import { useState } from 'react'
import type { PdfExportInclude } from '@shared/types/ipc'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  defaultInclude: PdfExportInclude
  onClose: () => void
  onExport: (include: PdfExportInclude, coloredRows: boolean) => Promise<void>
}

/** Independent checkboxes in the UI, mapped back to the existing PdfExportInclude union on export
 *  so the IPC contract and the remembered-preference setting stay unchanged. */
export default function ExportOptionsModal({ defaultInclude, onClose, onExport }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [includeSheet, setIncludeSheet] = useState(defaultInclude !== 'layout')
  const [includeLayout, setIncludeLayout] = useState(defaultInclude !== 'sheet')
  const [coloredRows, setColoredRows] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function handleExport(): Promise<void> {
    const include: PdfExportInclude = includeSheet && includeLayout ? 'both' : includeSheet ? 'sheet' : 'layout'
    setExporting(true)
    try {
      await onExport(include, coloredRows)
      onClose()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 340 }}>
        <h2 style={{ marginTop: 0 }}>Export to PDF</h2>
        <p className="card-sub" style={{ marginTop: 0 }}>What should the PDF include?</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={includeSheet} onChange={(e) => setIncludeSheet(e.target.checked)} />
          Setup sheet
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={includeLayout} onChange={(e) => setIncludeLayout(e.target.checked)} />
          Room layout
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={coloredRows}
            disabled={!includeSheet}
            onChange={(e) => setColoredRows(e.target.checked)}
          />
          Colored rows
        </label>
        <p className="card-sub" style={{ margin: '0 0 8px 24px' }}>
          Tints rows by their color. Leave off for black-and-white printing.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleExport}
            disabled={exporting || (!includeSheet && !includeLayout)}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
