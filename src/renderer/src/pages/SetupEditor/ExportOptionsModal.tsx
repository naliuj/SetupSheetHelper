import { useState } from 'react'
import type { PdfExportInclude, PdfExportOrientation, PdfExportDensity } from '@shared/types/ipc'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'

export interface ExportOptions {
  include: PdfExportInclude
  coloredRows: boolean
  orientation: PdfExportOrientation
  density: PdfExportDensity
}

interface Props {
  defaultInclude: PdfExportInclude
  onClose: () => void
  onExport: (options: ExportOptions) => Promise<void>
}

/** Independent checkboxes in the UI, mapped back to the existing PdfExportInclude union on export
 *  so the IPC contract and the remembered-preference setting stay unchanged. */
export default function ExportOptionsModal({ defaultInclude, onClose, onExport }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [includeSheet, setIncludeSheet] = useState(defaultInclude !== 'layout')
  const [includeLayout, setIncludeLayout] = useState(defaultInclude !== 'sheet')
  const [coloredRows, setColoredRows] = useState(false)
  const [orientation, setOrientation] = useState<PdfExportOrientation>('portrait')
  const [density, setDensity] = useState<PdfExportDensity>('normal')
  const [exporting, setExporting] = useState(false)

  async function handleExport(): Promise<void> {
    const include: PdfExportInclude = includeSheet && includeLayout ? 'both' : includeSheet ? 'sheet' : 'layout'
    setExporting(true)
    try {
      await onExport({ include, coloredRows, orientation, density })
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
        <div style={{ marginBottom: 8 }}>
          <ToggleSwitch checked={includeSheet} onChange={setIncludeSheet} label="Setup sheet" />
        </div>
        <div style={{ marginBottom: 8 }}>
          <ToggleSwitch checked={includeLayout} onChange={setIncludeLayout} label="Room layout" />
        </div>
        <div style={{ marginBottom: 4 }}>
          <ToggleSwitch
            checked={coloredRows}
            onChange={setColoredRows}
            disabled={!includeSheet}
            label="Colored rows"
          />
        </div>
        <p className="card-sub" style={{ margin: '0 0 12px 24px' }}>
          Tints rows by their color. Leave off for black-and-white printing.
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 4, opacity: includeSheet ? 1 : 0.5 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span className="card-sub" style={{ margin: 0 }}>Orientation</span>
            <select
              value={orientation}
              disabled={!includeSheet}
              onChange={(e) => setOrientation(e.target.value as PdfExportOrientation)}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span className="card-sub" style={{ margin: 0 }}>Density</span>
            <select
              value={density}
              disabled={!includeSheet}
              onChange={(e) => setDensity(e.target.value as PdfExportDensity)}
            >
              <option value="normal">Normal</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>
        <p className="card-sub" style={{ margin: '0 0 8px 0' }}>
          Landscape and Compact both fit more per page. Long text wraps onto extra lines either way.
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
