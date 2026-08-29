// Default import, not `import { Workbook } from 'exceljs'` — exceljs is CommonJS
// (`module.exports = { Workbook, ... }`), and Node's native ESM loader (main is built/run as
// real ESM, unlike the CJS-interop TypeScript performs at compile time) doesn't reliably
// synthesize named exports from it at runtime.
import ExcelJS from 'exceljs'
import { dialog } from 'electron'
import type { ExportSetupSpreadsheetInput, ExportSetupSpreadsheetResult } from '@shared/types/ipc'
import { getSetupWithItems } from '../db/repositories/setupsRepo'
import { getMicsByIds } from '../db/repositories/micsRepo'
import { getOutboardByIds } from '../db/repositories/outboardRepo'
import { getPreampsByIds } from '../db/repositories/preampRepo'
import { resolveMicText, resolveOutboardSlotText, resolvePreampText } from '../db/resolveGearLabels'
import { COLUMN_LABELS, orderedVisibleColumns } from '@shared/constants/setupColumns'

/** One spreadsheet column, keyed the same way SetupColumnKey is (plus 'sourceName', which is
 *  always shown and isn't itself a toggleable key). Order and visibility both come from the setup
 *  itself via orderedVisibleColumns(), the same helper the on-screen table uses, so the two can't
 *  drift the way they could when this file hardcoded its own sequence. */
interface ColumnDef {
  key: string
  header: string
  width: number
}

const BASE_WIDTHS: Record<string, number> = {
  sourceName: 22,
  mic: 20,
  phantomPower: 6,
  outboard: 18,
  channel: 10,
  preamp: 20,
  tieLine: 10,
  cueBox: 10,
  polarity: 10,
  notes: 30
}

/** Excel sheet names: 31-char hard limit, and `: \ / ? * [ ]` are all rejected outright. Distinct
 *  from the PDF export's filename sanitizer (exportSetupPdf.ts) — that one doesn't enforce a
 *  length cap since filenames don't have Excel's specific limit. */
function sanitizeSheetName(name: string): string {
  const cleaned = (name || 'Setup').replace(/[:\\/?*[\]]/g, '').trim() || 'Setup'
  return cleaned.slice(0, 31)
}

/** App-stored row color is plain `#rrggbb` (6 hex digits, no alpha); exceljs wants 8-hex
 *  `AARRGGBB`. Applied at full saturation here — unlike the PDF's `coloredRows` toggle, there's
 *  no per-export on/off decision for the spreadsheet, so this always runs when a row has a color. */
function hexToArgb(hex: string): string {
  const clean = hex.replace('#', '').toUpperCase()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return `FF${full}`
}

export async function exportSetupSpreadsheet(input: ExportSetupSpreadsheetInput): Promise<ExportSetupSpreadsheetResult> {
  const setup = getSetupWithItems(input.setupId)
  if (!setup) return { canceled: true }

  const micById = getMicsByIds(setup.items.flatMap((item) => (item.micId != null ? [item.micId] : [])))
  const preampById = getPreampsByIds(setup.items.flatMap((item) => (item.preampId != null ? [item.preampId] : [])))
  const outboardById = getOutboardByIds(
    setup.items.flatMap((item) => item.outboards.flatMap((s) => (s.outboardId != null ? [s.outboardId] : [])))
  )

  // Which columns get written. Normally the renderer's export chips have already decided —
  // `includeColumns` is the resolved, ordered list the user saw and could flip. Falling back to
  // the setup's own visible columns covers callers that predate the chips. Note the deliberate
  // behavior change the chips bring: their defaults leave EMPTY columns off, where this export
  // previously wrote every visible column blank-or-not. 'stereoLink' is skipped either way —
  // it's a row-pairing ornament, not data, with no spreadsheet equivalent.
  const exportedKeys = (
    input.includeColumns ?? orderedVisibleColumns(setup.columnOrder, setup.visibleColumns)
  ).filter((key) => key !== 'stereoLink')
  // Still needed below when filling each row's values: exceljs maps values to columns BY KEY, so
  // that loop is order-independent and only cares whether a column is present at all.
  const shownColumns = new Set(exportedKeys)
  // Source name is always leftmost; everything after it follows the resolved order, so the
  // spreadsheet reads left-to-right the same way the on-screen table does.
  const columns: ColumnDef[] = [{ key: 'sourceName', header: 'Source name', width: BASE_WIDTHS.sourceName }]
  for (const key of exportedKeys) {
    if (key === 'outboard') {
      // One real column per slot — deliberately NOT consolidated into one cell like the PDF export,
      // since a spreadsheet has no print-width constraint to save.
      for (let i = 0; i < setup.outboardColumnCount; i++) {
        columns.push({
          key: `outboard:${i}`,
          header: i === 0 ? 'Outboard' : `Outboard ${i + 1}`,
          width: BASE_WIDTHS.outboard
        })
      }
      continue
    }
    columns.push({ key, header: COLUMN_LABELS[key], width: BASE_WIDTHS[key] })
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Setup Sheet Helper'
  workbook.title = setup.name
  const worksheet = workbook.addWorksheet(sanitizeSheetName(setup.name))
  worksheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  worksheet.getRow(1).font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const item of setup.items) {
    const values: Record<string, string> = {
      sourceName: item.sourceName || ''
    }
    if (shownColumns.has('mic')) values.mic = resolveMicText(item, micById)
    if (shownColumns.has('phantomPower')) values.phantomPower = item.phantomPower ? 'Yes' : ''
    if (shownColumns.has('outboard')) {
      for (let i = 0; i < setup.outboardColumnCount; i++) {
        const slot = item.outboards.find((s) => s.slotIndex === i) ?? { slotIndex: i, outboardId: null, outboardText: null }
        values[`outboard:${i}`] = resolveOutboardSlotText(slot, outboardById)
      }
    }
    if (shownColumns.has('channel')) values.channel = item.channel != null ? String(item.channel) : ''
    if (shownColumns.has('preamp')) values.preamp = resolvePreampText(item, preampById)
    if (shownColumns.has('tieLine')) values.tieLine = item.tieLine != null ? String(item.tieLine) : ''
    if (shownColumns.has('cueBox')) values.cueBox = item.cueBox ?? ''
    if (shownColumns.has('polarity')) values.polarity = item.polarityFlip ? 'Yes' : ''
    if (shownColumns.has('notes')) values.notes = item.notes ?? ''

    const row = worksheet.addRow(values)
    if (item.color) {
      const argb = hexToArgb(item.color)
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
      })
    }
  }

  const saveResult = await dialog.showSaveDialog({
    title: 'Export Setup Sheet Spreadsheet',
    defaultPath: `${setup.name.replace(/[^\w\- ]/g, '')}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

  await workbook.xlsx.writeFile(saveResult.filePath)
  return { canceled: false, filePath: saveResult.filePath }
}
