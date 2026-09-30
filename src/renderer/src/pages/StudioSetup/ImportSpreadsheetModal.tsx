import { useMemo, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { useModalDialog } from '@renderer/hooks/useModalDialog'
import { formatGearLabel } from '@shared/utils/manufacturerPrefix'
import {
  buildImportRows,
  decodeSpreadsheet,
  guessHasHeader,
  guessMapping,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseDelimited,
  SPREADSHEET_EXTENSIONS,
  planImport,
  type ColumnField,
  type ExistingGear,
  type GearKind,
  type KindMode,
  type ParsedSheet,
  type PlannedItem
} from '@shared/utils/spreadsheetGear'

interface Props {
  /** Everything already on the studio page, saved or pending, so imports can add to it. */
  existing: ExistingGear[]
  /** Every maker in the app's catalogue, for splitting "Neumann U 87 Ai" when there is no
   *  manufacturer column. */
  knownManufacturers: string[]
  onImport: (items: PlannedItem[]) => void
  onClose: () => void
}

type Step = 'source' | 'match' | 'review'

const FIELD_OPTIONS: { value: ColumnField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'category', label: 'Category' },
  { value: 'quantity', label: 'Quantity / channels' },
  { value: 'type', label: 'Type (mic, outboard, preamp)' },
  { value: 'ignore', label: "Don't import" }
]

const KIND_OPTIONS: { value: KindMode; label: string }[] = [
  { value: 'mic', label: 'Mics' },
  { value: 'outboard', label: 'Outboard' },
  { value: 'preamp', label: 'Preamps' },
  { value: 'column', label: 'From a "Type" column' }
]

const KIND_NOUN: Record<GearKind, [string, string]> = {
  mic: ['mic', 'mics'],
  outboard: ['outboard unit', 'outboard units'],
  preamp: ['preamp', 'preamps']
}

const DELIMITER_NAME = { ',': 'comma separated', ';': 'semicolon separated', '\t': 'tab separated' } as const

/** "Import from a spreadsheet…" on the studio setup page: a CSV file or pasted cells, the columns
 *  matched to gear fields, then a review of exactly what will be added. The parsing and guessing
 *  are spreadsheetGear.ts; this is the three steps around them.
 *
 *  Nothing here writes anything. Import hands the planned items to the studio page, which puts them
 *  in its pending lists alongside everything else — they are saved, or thrown away, with the rest
 *  of the page. */
export default function ImportSpreadsheetModal({ existing, knownManufacturers, onImport, onClose }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const dialog = useModalDialog('Import gear from a spreadsheet')

  const [step, setStep] = useState<Step>('source')
  const [sourceLabel, setSourceLabel] = useState('')
  const [pasted, setPasted] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<ColumnField[]>([])
  const [uncertain, setUncertain] = useState<boolean[]>([])
  const [kindMode, setKindMode] = useState<KindMode>('mic')
  // Planned items the user unticked on the review step, by index into the plan.
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  // A file is being dragged over the dialog. A counter rather than a flag: dragenter/dragleave fire
  // for every child element crossed, so a flag flickers off whenever the pointer passes over text.
  const [dragDepth, setDragDepth] = useState(0)

  const header = sheet && hasHeader ? sheet.rows[0] : null
  const dataRows = useMemo(() => (sheet ? (hasHeader ? sheet.rows.slice(1) : sheet.rows) : []), [sheet, hasHeader])

  function applyGuesses(nextSheet: ParsedSheet, withHeader: boolean): void {
    const rows = withHeader ? nextSheet.rows.slice(1) : nextSheet.rows
    const guesses = guessMapping(withHeader ? nextSheet.rows[0] : null, rows)
    setMapping(guesses.map((g) => g.field))
    setUncertain(guesses.map((g) => g.uncertain))
    setKindMode((mode) => (guesses.some((g) => g.field === 'type') ? 'column' : mode === 'column' ? 'mic' : mode))
  }

  function load(text: string, label: string): void {
    const parsed = parseDelimited(text)
    if (parsed.rows.length === 0 || (parsed.rows.length === 1 && guessHasHeader(parsed.rows))) {
      setLoadError("Couldn't find any rows of gear in that. Check it's a CSV, or copy the cells themselves.")
      return
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS + 1) {
      setLoadError(`That has ${parsed.rows.length.toLocaleString()} rows — more than the ${MAX_IMPORT_ROWS.toLocaleString()} one import can take. Split it into smaller files.`)
      return
    }
    const withHeader = guessHasHeader(parsed.rows)
    setLoadError(null)
    setSheet(parsed)
    setSourceLabel(label)
    setHasHeader(withHeader)
    applyGuesses(parsed, withHeader)
    setExcluded(new Set())
    setStep('match')
  }

  async function chooseFile(): Promise<void> {
    setBusy(true)
    try {
      const picked = await window.api.spreadsheetImport.pick()
      if (!picked) return
      if (picked.error) setLoadError(picked.error)
      else load(picked.text, picked.fileName)
    } finally {
      setBusy(false)
    }
  }

  const isFileDrag = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

  /** A file dropped anywhere on the dialog or its backdrop — every drop is caught here, since one
   *  that lands on the window itself would make Electron navigate away to show the file. Works from
   *  any step: dropping a different file starts over with it. */
  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    setDragDepth(0)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!(SPREADSHEET_EXTENSIONS as readonly string[]).includes(extension)) {
      setStep('source')
      setLoadError(`“${file.name}” isn't a CSV. In Excel or Numbers, use File → Export (or Save As) → CSV first.`)
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setStep('source')
      setLoadError('That file is too big to be a gear list (over 5 MB).')
      return
    }
    load(decodeSpreadsheet(new Uint8Array(await file.arrayBuffer())), file.name)
  }

  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      setDragDepth((d) => d + 1)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      setDragDepth((d) => Math.max(0, d - 1))
    },
    onDrop: (e: React.DragEvent) => {
      if (isFileDrag(e)) void handleDrop(e)
    }
  }

  function toggleHeader(on: boolean): void {
    if (!sheet) return
    setHasHeader(on)
    applyGuesses(sheet, on)
  }

  /** Each field belongs to one column: giving it to this column takes it from any other. */
  function setField(index: number, field: ColumnField): void {
    setMapping((prev) => prev.map((f, i) => (i === index ? field : field !== 'ignore' && f === field ? 'ignore' : f)))
    setUncertain((prev) => prev.map((u, i) => (i === index ? false : u)))
    if (field === 'type') setKindMode('column')
  }

  const hasName = mapping.includes('name')
  const needsTypeColumn = kindMode === 'column' && !mapping.includes('type')
  const firstRowNumber = (sheet?.skippedLeadingRows ?? 0) + (hasHeader ? 2 : 1)

  const importRows = useMemo(
    () => (step === 'review' ? buildImportRows(dataRows, mapping, kindMode, knownManufacturers, firstRowNumber) : []),
    [step, dataRows, mapping, kindMode, knownManufacturers, firstRowNumber]
  )
  const plan = useMemo(() => (step === 'review' ? planImport(importRows, existing) : []), [step, importRows, existing])
  const skipped = importRows.filter((r) => r.skipReason)
  const included = plan.filter((_, i) => !excluded.has(i))
  const mixedKinds = new Set(plan.map((p) => p.kind)).size > 1

  function importNoun(items: PlannedItem[]): string {
    const kinds = new Set(items.map((i) => i.kind))
    if (kinds.size !== 1) return items.length === 1 ? 'item' : 'items'
    const [one, many] = KIND_NOUN[[...kinds][0]]
    return items.length === 1 ? one : many
  }

  function countLabel(item: { kind: GearKind }, n: number): string {
    return item.kind === 'preamp' ? `${n} ch` : `×${n}`
  }

  return (
    <div className="modal-overlay" onClick={onClose} {...dropHandlers}>
      <div className="modal spreadsheet-import" {...dialog} onClick={(e) => e.stopPropagation()}>
        {dragDepth > 0 && (
          <div className="spreadsheet-import-dropveil" aria-hidden="true">
            <Upload size={22} />
            {step === 'source' ? 'Drop to import' : 'Drop to start over with this file'}
          </div>
        )}
        <div className="spreadsheet-import-title">
          <h2 style={{ margin: 0 }}>Import gear from a spreadsheet</h2>
          <span className="card-sub">
            Step {step === 'source' ? 1 : step === 'match' ? 2 : 3} of 3 ·{' '}
            {step === 'source' ? 'Choose a file' : step === 'match' ? 'Match columns' : 'Review'}
          </span>
        </div>

        {step === 'source' && (
          <>
            <p className="card-sub" style={{ marginTop: 4 }}>
              Any gear list works — the columns can be in any order and called anything. You&apos;ll
              match them up next, and see exactly what will be added before anything changes.
            </p>
            <div className="spreadsheet-import-dropzone">
              <FileSpreadsheet size={26} aria-hidden="true" className="spreadsheet-import-dropicon" />
              <div>Drag a CSV file here</div>
              <div className="card-sub">or</div>
              <button className="btn primary" onClick={chooseFile} disabled={busy}>
                {busy ? 'Opening…' : 'Choose a file…'}
              </button>
            </div>
            <button
              className="btn small"
              onClick={() => void window.api.spreadsheetImport.saveTemplate()}
              style={{ marginTop: 8 }}
            >
              Download template
            </button>
            <label htmlFor="spreadsheet-paste" className="card-sub" style={{ display: 'block', margin: '16px 0 4px' }}>
              Or paste cells copied from Excel, Numbers or Google Sheets
            </label>
            <textarea
              id="spreadsheet-paste"
              className="field-input spreadsheet-import-paste"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'Manufacturer\tName\tQuantity\nNeumann\tU 87 Ai\t2'}
              spellCheck={false}
            />
            {loadError && (
              <p className="card-sub inline-icon-text" role="alert" style={{ color: 'var(--color-danger)' }}>
                <AlertTriangle size={13} aria-hidden="true" /> {loadError}
              </p>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" onClick={() => load(pasted, 'Pasted cells')} disabled={!pasted.trim()}>
                Use pasted cells
              </button>
            </div>
          </>
        )}

        {step === 'match' && sheet && (
          <>
            <p className="card-sub" style={{ marginTop: 4 }}>
              {sourceLabel} · {dataRows.length} {dataRows.length === 1 ? 'row' : 'rows'} ·{' '}
              {DELIMITER_NAME[sheet.delimiter]}
              {sheet.skippedLeadingRows > 0 &&
                ` · skipped ${sheet.skippedLeadingRows} title ${sheet.skippedLeadingRows === 1 ? 'line' : 'lines'} above the table`}
            </p>
            <div className="spreadsheet-import-kinds" role="group" aria-label="Import these rows as">
              <span className="card-sub">Import these rows as</span>
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.value}
                  className={kindMode === k.value ? 'btn small primary' : 'btn small'}
                  aria-pressed={kindMode === k.value}
                  onClick={() => setKindMode(k.value)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <label className="inline-icon-text card-sub" style={{ gap: 6, marginBottom: 8 }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
              First row is column names
            </label>

            <div className="spreadsheet-import-columns" role="table" aria-label="Columns in the file">
              <div className="spreadsheet-import-colrow spreadsheet-import-colhead" role="row">
                <span role="columnheader">Column in file</span>
                <span role="columnheader">Sample values</span>
                <span role="columnheader">Fills</span>
              </div>
              {mapping.map((field, i) => {
                const samples = dataRows
                  .map((r) => r[i] ?? '')
                  .filter((v) => v !== '')
                  .slice(0, 3)
                const label = header?.[i] || `Column ${i + 1}`
                return (
                  <div key={i} className="spreadsheet-import-colrow" role="row">
                    <span role="cell" className="truncate" title={label} style={{ fontWeight: 600 }}>
                      {label}
                    </span>
                    <span role="cell" className="truncate card-sub" title={samples.join(' · ')}>
                      {samples.length ? samples.join(' · ') : 'empty'}
                    </span>
                    <span role="cell">
                      <select
                        aria-label={`What column “${label}” fills`}
                        value={field}
                        onChange={(e) => setField(i, e.target.value as ColumnField)}
                        className={uncertain[i] ? 'spreadsheet-import-guessed' : undefined}
                      >
                        {FIELD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </span>
                    {uncertain[i] && field !== 'ignore' && (
                      <span className="warning-badge spreadsheet-import-guess-note">
                        Guessed{header ? ` from the name “${label}”` : ' from what’s in it'} — check this is right.
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="modal-actions spreadsheet-import-footer">
              <span className="card-sub" role="status">
                {!hasName
                  ? 'Choose which column holds the gear name to continue.'
                  : needsTypeColumn
                    ? 'Choose the column that says mic, outboard or preamp, or pick one kind above.'
                    : 'Only the name is required.'}
              </span>
              <button className="btn" onClick={() => setStep('source')}>
                Back
              </button>
              <button
                className="btn primary"
                onClick={() => setStep('review')}
                disabled={!hasName || needsTypeColumn}
              >
                Review {dataRows.length} {dataRows.length === 1 ? 'row' : 'rows'}
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <div className="spreadsheet-import-chips">
              <span className="spreadsheet-import-chip">
                <strong>{plan.filter((p) => !p.target).length}</strong> new
              </span>
              <span className="spreadsheet-import-chip">
                <strong>{plan.filter((p) => p.target).length}</strong> added to gear you have
              </span>
              {skipped.length > 0 && (
                <span className="spreadsheet-import-chip warning">
                  <strong>{skipped.length}</strong> skipped
                </span>
              )}
            </div>
            <div className="spreadsheet-import-review" role="list">
              {plan.map((item, i) => {
                const label = formatGearLabel(item.name, item.manufacturer)
                const status = item.target
                  ? item.target.spelledAs
                    ? `Same as your “${item.target.spelledAs}” — ${countLabel(item, item.target.existingCount)} → ${countLabel(item, item.target.existingCount + item.count)}`
                    : `Adds to yours — ${countLabel(item, item.target.existingCount)} → ${countLabel(item, item.target.existingCount + item.count)}`
                  : 'New'
                return (
                  <label key={i} className="spreadsheet-import-item" role="listitem">
                    <input
                      type="checkbox"
                      checked={!excluded.has(i)}
                      onChange={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                    />
                    <span className="truncate" title={label}>
                      {label}
                      {mixedKinds && <span className="card-sub"> · {KIND_NOUN[item.kind][0]}</span>}
                    </span>
                    <span className="no-shrink">{countLabel(item, item.count)}</span>
                    <span className={item.target ? 'spreadsheet-import-adds' : 'card-sub'}>{status}</span>
                    {item.notes.length > 0 && (
                      <span className="warning-badge spreadsheet-import-item-note">{item.notes.join(' · ')}</span>
                    )}
                  </label>
                )
              })}
              {skipped.map((row) => (
                <div key={`skip-${row.rowNumber}`} className="spreadsheet-import-item skipped" role="listitem">
                  <span aria-hidden="true" />
                  <span className="truncate">
                    Row {row.rowNumber}
                    {row.name ? ` · “${row.name}”` : ''}
                  </span>
                  <span />
                  <span className="warning-badge">Skipped — {row.skipReason}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions spreadsheet-import-footer">
              <span className="card-sub">Nothing is saved until you save the studio.</span>
              <button className="btn" onClick={() => setStep('match')}>
                Back
              </button>
              <button
                className="btn primary"
                disabled={included.length === 0}
                onClick={() => {
                  onImport(included)
                  onClose()
                }}
              >
                Import {included.length} {importNoun(included)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
