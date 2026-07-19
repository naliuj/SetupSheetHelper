import { usePdfLayoutPrefsStore } from '@renderer/state/pdfLayoutPrefsStore'
import { PDF_GRID_STYLES, PDF_DATE_FORMATS, formatPdfDate, type PdfGridStyle, type PdfDateFormat } from '@shared/constants/pdfLayout'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import SwatchPicker from '@renderer/components/SwatchPicker'

/** Global table-style preferences for the PDF setup-sheet export — set once here, applied to
 *  every export automatically (no per-export override in the Export Options modal). */
export default function PdfLayoutEditor(): JSX.Element {
  const gridStyle = usePdfLayoutPrefsStore((s) => s.gridStyle)
  const zebraStripes = usePdfLayoutPrefsStore((s) => s.zebraStripes)
  const headerShaded = usePdfLayoutPrefsStore((s) => s.headerShaded)
  const accentColor = usePdfLayoutPrefsStore((s) => s.accentColor)
  const dateFormat = usePdfLayoutPrefsStore((s) => s.dateFormat)
  const setGridStyle = usePdfLayoutPrefsStore((s) => s.setGridStyle)
  const setZebraStripes = usePdfLayoutPrefsStore((s) => s.setZebraStripes)
  const setHeaderShaded = usePdfLayoutPrefsStore((s) => s.setHeaderShaded)
  const setAccentColor = usePdfLayoutPrefsStore((s) => s.setAccentColor)
  const setDateFormat = usePdfLayoutPrefsStore((s) => s.setDateFormat)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Table grid lines</label>
        <select
          value={gridStyle}
          onChange={(e) => setGridStyle(e.target.value as PdfGridStyle)}
          style={{ width: 260 }}
        >
          {PDF_GRID_STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="card-sub" style={{ marginTop: 4 }}>
          Controls border and separator lines around the table on every PDF export.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <ToggleSwitch checked={zebraStripes} onChange={setZebraStripes} label="Zebra striping" />
        <p className="card-sub" style={{ marginTop: 4 }}>
          Alternating pale row bands. Rows with a custom color (set via Export Options) alternate between a light
          and dark shade of that same color instead.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <ToggleSwitch checked={headerShaded} onChange={setHeaderShaded} label="Shaded header row" />
        <p className="card-sub" style={{ marginTop: 4 }}>
          Fills the header row background instead of just a thin underline.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Accent color</label>
        <SwatchPicker value={accentColor} onChange={setAccentColor} allowNone title="PDF accent color" />
        <p className="card-sub" style={{ marginTop: 4 }}>
          Tints the header shading, grid lines, and title text. "No color" keeps everything neutral gray/black.
        </p>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 4 }}>Session date format</label>
        <select
          value={dateFormat}
          onChange={(e) => setDateFormat(e.target.value as PdfDateFormat)}
          style={{ width: 260 }}
        >
          {PDF_DATE_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <p className="card-sub" style={{ marginTop: 4 }}>
          How the setup's session date reads in the PDF title, e.g. "
          {formatPdfDate(new Date().toLocaleDateString('en-CA'), dateFormat)}" for today.
        </p>
      </div>
    </div>
  )
}
