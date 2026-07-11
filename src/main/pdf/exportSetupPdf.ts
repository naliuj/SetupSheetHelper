import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import type {
  ExportSetupPdfInput,
  ExportSetupPdfResult,
  PdfExportDensity,
  PdfExportOrientation
} from '@shared/types/ipc'
import { getSetupWithItems } from '../db/repositories/setupsRepo'
import { getLayoutFileForStudio } from '../db/repositories/roomLayoutFileRepo'
import { getMicById } from '../db/repositories/micsRepo'
import { getOutboardById } from '../db/repositories/outboardRepo'
import { getPreampById } from '../db/repositories/preampRepo'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import { fitColumns, wrapText, type ColumnSpec } from './pdfLayout'

// US Letter, points. Portrait is the short edge (612) horizontal; landscape swaps them.
const LETTER_SHORT = 612
const LETTER_LONG = 792
const MARGIN = 36
const CELL_PAD = 2 // horizontal breathing room inside a cell, each side

/** Font size + spacing that vary with the chosen density. Compact packs more rows per page;
 *  normal stays larger and more legible. Sizes stay above a ~7pt legibility floor. */
interface DensityConfig {
  bodySize: number
  headerSize: number
  lineHeight: number
  rowPadding: number // extra vertical space added to a row on top of its text lines
}
const DENSITY: Record<PdfExportDensity, DensityConfig> = {
  normal: { bodySize: 9, headerSize: 9, lineHeight: 11, rowPadding: 6 },
  compact: { bodySize: 7.5, headerSize: 8, lineHeight: 9, rowPadding: 4 }
}

// The setup sheet's on-screen table has one column per outboard slot, but the PDF consolidates
// them all into a single "Outboard" column (each row's gear joined into one wrapping cell) to keep
// the export compact. Its width sits between a normal text column and the widest.
const COLUMNS: ColumnSpec[] = [
  { key: 'sourceName', label: 'Source Name', width: 80, minWidth: 60 },
  { key: 'mic', label: 'Microphone', width: 80, minWidth: 60 },
  { key: 'outboard', label: 'Outboard', width: 95, minWidth: 65 },
  { key: 'channel', label: 'Channel', width: 40, minWidth: 34 },
  { key: 'preamp', label: 'Preamp', width: 55, minWidth: 45 },
  { key: 'tieLine', label: 'Tie Line', width: 45, minWidth: 38 },
  { key: 'cueBox', label: 'Cue Box', width: 45, minWidth: 38 },
  { key: 'polarity', label: 'Polarity', width: 50, minWidth: 42 },
  { key: 'notes', label: 'Notes', width: 70, minWidth: 60 }
]

/** True if every row is blank for this column key — such a column is omitted entirely rather
 *  than printing a useless blank strip (independently per column: outboard, preamp, cue box, and
 *  polarity are unrelated and each checked on its own). */
function isColumnEmpty(key: string, itemIds: number[], resolvedValues: Map<number, Record<string, string>>): boolean {
  return itemIds.every((id) => !(resolvedValues.get(id)?.[key] ?? '').trim())
}

function findTieLineConflicts(items: { tieLine: number | null }[]): Set<number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    if (item.tieLine == null) continue
    counts.set(item.tieLine, (counts.get(item.tieLine) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([tieLine]) => tieLine))
}

/** A row's swatch color mixed heavily toward white, so the printed tint stays pale enough to keep
 *  black row text legible (and reasonable in grayscale). */
function hexToPaleRgb(hex: string): ReturnType<typeof rgb> {
  const n = hex.replace('#', '')
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const toward = (c: number): number => c * 0.22 + 0.78
  return rgb(toward(r), toward(g), toward(b))
}

export async function exportSetupPdf(input: ExportSetupPdfInput): Promise<ExportSetupPdfResult> {
  const setup = getSetupWithItems(input.setupId)
  if (!setup) return { canceled: true }

  const layout = getLayoutFileForStudio(setup.studioId)
  const conflicts = findTieLineConflicts(setup.items)

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Table page(s) — skipped entirely for a "room layout only" export.
  if (input.include !== 'layout') {
    const orientation: PdfExportOrientation = input.orientation
    const pageWidth = orientation === 'landscape' ? LETTER_LONG : LETTER_SHORT
    const pageHeight = orientation === 'landscape' ? LETTER_SHORT : LETTER_LONG
    const usableWidth = pageWidth - 2 * MARGIN
    const dens = DENSITY[input.density]

    const resolvedValues = new Map<number, Record<string, string>>()
    for (const item of setup.items) {
      const mic = item.micId != null ? getMicById(item.micId) : null
      const preamp = item.preampId != null ? getPreampById(item.preampId) : null
      const isConflict = item.tieLine != null && conflicts.has(item.tieLine)

      // Consolidate every outboard slot into one comma-joined cell (empty slots skipped), in slot
      // order — the wrapping cell keeps it readable no matter how many pieces of gear a row has.
      const outboardParts: string[] = []
      for (let i = 0; i < setup.outboardColumnCount; i++) {
        const slot = item.outboards.find((s) => s.slotIndex === i)
        const outboard = slot?.outboardId != null ? getOutboardById(slot.outboardId) : null
        const text = outboard
          ? stripManufacturerPrefix(outboard.name, outboard.manufacturer ?? '')
          : slot?.outboardText ?? ''
        if (text.trim()) outboardParts.push(text.trim())
      }

      const values: Record<string, string> = {
        sourceName: item.sourceName || '',
        mic: mic ? mic.name : item.micText ?? '',
        outboard: outboardParts.join(', '),
        channel: item.channel != null ? String(item.channel) : '',
        preamp: preamp ? stripManufacturerPrefix(preamp.name, preamp.manufacturer ?? '') : item.preampText ?? '',
        tieLine: item.tieLine != null ? `${isConflict ? '⚠ ' : ''}${item.tieLine}` : '',
        cueBox: item.cueBox != null ? String(item.cueBox) : '',
        polarity: item.polarityFlip ? 'Yes' : '',
        notes: item.notes ?? ''
      }
      resolvedValues.set(item.id, values)
    }

    // Outboard, Preamp, Tie Line, Cue Box, and Polarity are each independently omittable if blank
    // across the whole sheet; every other column always shows.
    const itemIds = setup.items.map((item) => item.id)
    const omittableKeys = ['outboard', 'preamp', 'tieLine', 'cueBox', 'polarity']
    const keptColumns = COLUMNS.filter(
      (col) => !omittableKeys.includes(col.key) || !isColumnEmpty(col.key, itemIds, resolvedValues)
    )

    // Fit the kept columns to the page width — shrink an over-wide table, or hand slack to text
    // columns on a narrow one — so nothing ever runs off the right edge.
    const visibleColumns = fitColumns(keptColumns, usableWidth)
    const headerHeight = dens.lineHeight + dens.rowPadding + 3

    let page = pdfDoc.addPage([pageWidth, pageHeight])
    let cursorY = pageHeight - MARGIN

    const drawTitle = (): void => {
      page.drawText(`${setup.name}${setup.sessionDate ? `  —  ${setup.sessionDate}` : ''}`, {
        x: MARGIN,
        y: cursorY,
        size: 14,
        font: boldFont
      })
      cursorY -= 18

      if (setup.engineer || setup.artist) {
        const parts: string[] = []
        if (setup.engineer) parts.push(`Engineer: ${setup.engineer}`)
        if (setup.artist) parts.push(`Artist: ${setup.artist}`)
        page.drawText(parts.join('   '), { x: MARGIN, y: cursorY, size: 10, font })
        cursorY -= 18
      } else {
        cursorY -= 6
      }
    }

    const drawHeaderRow = (): void => {
      let x = MARGIN
      for (const col of visibleColumns) {
        page.drawText(col.label, { x: x + CELL_PAD, y: cursorY, size: dens.headerSize, font: boldFont })
        x += col.width
      }
      cursorY -= headerHeight
      page.drawLine({
        start: { x: MARGIN, y: cursorY + dens.rowPadding },
        end: { x: pageWidth - MARGIN, y: cursorY + dens.rowPadding },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6)
      })
    }

    const startNewPage = (): void => {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      cursorY = pageHeight - MARGIN
      drawHeaderRow()
    }

    drawTitle()
    drawHeaderRow()

    const tableWidth = visibleColumns.reduce((w, c) => w + c.width, 0)

    for (const item of setup.items) {
      const values = resolvedValues.get(item.id)!

      // Wrap every cell to its column width, then size the row to the tallest cell.
      const wrappedByKey = new Map<string, string[]>()
      let maxLines = 1
      for (const col of visibleColumns) {
        const lines = wrapText(values[col.key] ?? '', font, dens.bodySize, col.width - 2 * CELL_PAD)
        wrappedByKey.set(col.key, lines)
        if (lines.length > maxLines) maxLines = lines.length
      }
      const rowHeight = maxLines * dens.lineHeight + dens.rowPadding

      // Page-break before drawing when this row won't fit (height-aware). A row taller than a whole
      // page body is pathological; we still draw it from the top of a fresh page and let it run.
      if (cursorY - rowHeight < MARGIN) {
        startNewPage()
      }

      if (input.coloredRows && item.color) {
        page.drawRectangle({
          x: MARGIN - 2,
          y: cursorY - rowHeight + dens.rowPadding,
          width: tableWidth + 4,
          height: rowHeight,
          color: hexToPaleRgb(item.color)
        })
      }

      let x = MARGIN
      for (const col of visibleColumns) {
        const lines = wrappedByKey.get(col.key)!
        lines.forEach((line, i) => {
          page.drawText(line, {
            x: x + CELL_PAD,
            y: cursorY - i * dens.lineHeight,
            size: dens.bodySize,
            font
          })
        })
        x += col.width
      }
      cursorY -= rowHeight
    }
  }

  // Final page (optional): flattened room layout (Konva stage image), appended after the
  // table so the sheet reads first — only present when the session was built in Layout Mode.
  if (input.include !== 'sheet' && input.layoutImageDataUrl) {
    const base64 = input.layoutImageDataUrl.replace(/^data:image\/png;base64,/, '')
    const imageBytes = Buffer.from(base64, 'base64')
    const pngImage = await pdfDoc.embedPng(imageBytes)
    const imgDims = pngImage.size()

    const pageWidth = layout?.pageWidthPt ?? imgDims.width
    const pageHeight = layout?.pageHeightPt ?? imgDims.height
    const layoutPage = pdfDoc.addPage([pageWidth, pageHeight])
    const scale = Math.min(pageWidth / imgDims.width, pageHeight / imgDims.height)
    const drawWidth = imgDims.width * scale
    const drawHeight = imgDims.height * scale
    layoutPage.drawImage(pngImage, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight
    })
  }

  const pdfBytes = await pdfDoc.save()

  const saveResult = await dialog.showSaveDialog({
    title: 'Export Setup Sheet PDF',
    defaultPath: `${setup.name.replace(/[^\w\- ]/g, '')}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

  writeFileSync(saveResult.filePath, pdfBytes)
  return { canceled: false, filePath: saveResult.filePath }
}
