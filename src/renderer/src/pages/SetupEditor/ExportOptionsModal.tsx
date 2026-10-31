import { useState } from 'react'
import type { PdfExportParts, PdfExportOrientation, PdfExportDensity } from '@shared/types/ipc'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import ExportColumnChips, { useExportColumnChips } from '@renderer/components/ExportColumnChips'
import { useNavigationStore } from '@renderer/state/navigationStore'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import { useModalDialog } from '@renderer/hooks/useModalDialog'

export interface ExportOptions {
  parts: PdfExportParts
  coloredRows: boolean
  orientation: PdfExportOrientation
  density: PdfExportDensity
  includeColumns: SetupColumnKey[]
}

interface Props {
  defaultParts: PdfExportParts
  defaultColoredRows: boolean
  /** Whether this setup currently resolves to an effective room layout (a studio file, a
   *  per-setup file override, or a chosen blank sheet) — the "Room layout" toggle only makes
   *  sense to offer when there's something to include. */
  hasLayout: boolean
  /** Whether the setup's studio has a patchbay drawing — the same gate for the "Patchbay" toggle. */
  hasPatchbay: boolean
  onClose: () => void
  onExport: (options: ExportOptions) => Promise<void>
}

/** One independent toggle per part of the PDF: the setup sheet, the room layout, and the patchbay
 *  (its drawing with the cables, then the cable list). */
export default function ExportOptionsModal({
  defaultParts,
  defaultColoredRows,
  hasLayout,
  hasPatchbay,
  onClose,
  onExport
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  // A remembered part this setup can't offer starts off. If that leaves nothing on — a remembered
  // "layout only" from some other studio that had one — the setup sheet starts checked, so the
  // dialog never opens with every toggle off and no way to tell why Export is inert.
  const startLayout = hasLayout && defaultParts.layout
  const startPatchbay = hasPatchbay && defaultParts.patchbay
  const [includeSheet, setIncludeSheet] = useState(defaultParts.sheet || (!startLayout && !startPatchbay))
  const [includeLayout, setIncludeLayout] = useState(startLayout)
  const [includePatchbay, setIncludePatchbay] = useState(startPatchbay)
  const anyPart = includeSheet || includeLayout || includePatchbay
  const [coloredRows, setColoredRows] = useState(defaultColoredRows)
  const [orientation, setOrientation] = useState<PdfExportOrientation>('portrait')
  const [density, setDensity] = useState<PdfExportDensity>('normal')
  const [exporting, setExporting] = useState(false)

  const chips = useExportColumnChips()

  const goToSettings = useNavigationStore((s) => s.goToSettings)

  // Grid lines/zebra stripes/header shading/accent color aren't per-export options — they're
  // global preferences (see PdfLayoutEditor.tsx's own doc comment) — so this just deep-links
  // there rather than duplicating those controls in the modal.
  function handleOpenPdfSettings(): void {
    onClose()
    goToSettings('pdfLayout')
  }

  async function handleExport(): Promise<void> {
    const parts: PdfExportParts = { sheet: includeSheet, layout: includeLayout, patchbay: includePatchbay }
    setExporting(true)
    try {
      await onExport({ parts, coloredRows, orientation, density, includeColumns: chips.included })
      onClose()
    } finally {
      setExporting(false)
    }
  }

  const dialog = useModalDialog('Export to PDF')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Export to PDF</h2>
          <span
            onClick={handleOpenPdfSettings}
            style={{ fontSize: 12, color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            PDF style settings
          </span>
        </div>
        <p className="card-sub" style={{ marginTop: 0 }}>What should the PDF include?</p>
        <div style={{ marginBottom: 8 }}>
          <ToggleSwitch checked={includeSheet} onChange={setIncludeSheet} label="Setup sheet" />
        </div>
        {hasLayout && (
          <div style={{ marginBottom: 8 }}>
            <ToggleSwitch checked={includeLayout} onChange={setIncludeLayout} label="Room layout" />
          </div>
        )}
        {hasPatchbay && (
          <div style={{ marginBottom: 8 }}>
            <ToggleSwitch checked={includePatchbay} onChange={setIncludePatchbay} label="Patchbay" />
          </div>
        )}
        <div style={{ marginBottom: 4 }}>
          <ToggleSwitch checked={coloredRows} onChange={setColoredRows} disabled={!anyPart} label="Colored" />
        </div>
        <p className="card-sub" style={{ margin: '0 0 12px 24px' }}>
          {hasPatchbay
            ? 'Tints rows and layout blocks by color, and keeps patch cables in color. Leave off for black-and-white printing.'
            : 'Tints rows and layout blocks by color. Leave off for black-and-white printing.'}
        </p>

        {includeSheet && <ExportColumnChips states={chips.states} onToggle={chips.toggle} />}

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
            // A sheet with every column chip off would print an empty table.
            disabled={exporting || !anyPart || (includeSheet && chips.included.length === 0)}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
