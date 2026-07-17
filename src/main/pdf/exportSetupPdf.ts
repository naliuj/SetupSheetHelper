import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import type {
  ExportSetupPdfInput,
  ExportSetupPdfResult,
  PdfExportDensity,
  PdfExportOrientation
} from '@shared/types/ipc'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { parsePdfAccentColor, parsePdfBoolSetting, parsePdfGridStyle } from '@shared/constants/pdfLayout'
import { getSetupWithItems } from '../db/repositories/setupsRepo'
import { getLayoutFileForStudio } from '../db/repositories/roomLayoutFileRepo'
import { getMicsByIds } from '../db/repositories/micsRepo'
import { getOutboardByIds } from '../db/repositories/outboardRepo'
import { getPreampsByIds } from '../db/repositories/preampRepo'
import { getSetting } from '../db/repositories/settingsRepo'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import { fitColumns, wrapText, type ColumnSpec } from './pdfLayout'

// US Letter, points. Portrait is the short edge (612) horizontal; landscape swaps them.
const LETTER_SHORT = 612
const LETTER_LONG = 792
const MARGIN = 36
const CELL_PAD = 2 // horizontal breathing room inside a cell, each side
// Shared left/right inset for every filled rectangle and frame (row tint, zebra band, header
// shading, outer grid frame) so their edges all line up instead of drifting by a point or two.
const ROW_FILL_INSET = 2

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
  { key: 'phantomPower', label: '48V', width: 32, minWidth: 26 },
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

function hexToComponents(hex: string): { r: number; g: number; b: number } {
  const n = hex.replace('#', '')
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255
  }
}

/** A row's swatch color mixed heavily toward white, so the printed tint stays pale enough to keep
 *  black row text legible (and reasonable in grayscale). Used for row/header background fills. */
function hexToPaleRgb(hex: string): ReturnType<typeof rgb> {
  const { r, g, b } = hexToComponents(hex)
  const toward = (c: number): number => c * 0.22 + 0.78
  return rgb(toward(r), toward(g), toward(b))
}

/** A noticeably deeper tint of the same color than hexToPaleRgb — the "dark" half of a custom
 *  row's zebra pair, so a fully colored sheet still reads an alternating pattern instead of
 *  zebra striping having nothing left to draw once every row already has its own color. */
function hexToPaleRgbDark(hex: string): ReturnType<typeof rgb> {
  const { r, g, b } = hexToComponents(hex)
  const toward = (c: number): number => c * 0.4 + 0.55
  return rgb(toward(r), toward(g), toward(b))
}

/** The accent color at full saturation — used for grid lines and title text, where a pale wash
 *  (as used for fills) would be too faint at a thin line weight or small text size to read as
 *  the chosen color at all. */
function hexToAccentRgb(hex: string): ReturnType<typeof rgb> {
  const { r, g, b } = hexToComponents(hex)
  return rgb(r, g, b)
}

/** The first-line baseline y that vertically centers `lineCount` lines of text (spaced by
 *  `lineHeight`) within [boxBottom, boxTop], using the font's real ascent/descent metrics rather
 *  than a fixed padding guess. Previously every cell was top-anchored with all its padding pushed
 *  below the text — invisible with no cell borders, but visibly off-center once grid lines box
 *  each cell in. */
function centeredFirstBaselineY(
  font: PDFFont,
  size: number,
  lineHeight: number,
  lineCount: number,
  boxTop: number,
  boxBottom: number
): number {
  const fullHeight = font.heightAtSize(size)
  const descent = fullHeight - font.heightAtSize(size, { descender: false })
  const blockHeight = (lineCount - 1) * lineHeight + fullHeight
  const boxHeight = boxTop - boxBottom
  return boxBottom + (boxHeight - blockHeight) / 2 + descent + (lineCount - 1) * lineHeight
}

export async function exportSetupPdf(input: ExportSetupPdfInput): Promise<ExportSetupPdfResult> {
  const setup = getSetupWithItems(input.setupId)
  if (!setup) return { canceled: true }

  const layout = getLayoutFileForStudio(setup.studioId)
  const conflicts = findTieLineConflicts(setup.items)

  // Table style is a global, persistent preference (Settings > PDF Layout), not a per-export
  // option — read directly here rather than threading it through ExportSetupPdfInput, the same
  // way setupsRepo reads defaultVisibleColumns.
  const gridStyle = parsePdfGridStyle(getSetting(APP_SETTINGS_KEYS.pdfGridStyle))
  const zebraStripes = parsePdfBoolSetting(getSetting(APP_SETTINGS_KEYS.pdfZebraStripes))
  const headerShaded = parsePdfBoolSetting(getSetting(APP_SETTINGS_KEYS.pdfHeaderShaded))
  const accentColor = parsePdfAccentColor(getSetting(APP_SETTINGS_KEYS.pdfAccentColor))
  const gridLineColor = accentColor ? hexToAccentRgb(accentColor) : rgb(0.6, 0.6, 0.6)

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  // Helvetica's WinAnsi encoding can't represent a checkmark glyph — the 48V column's "✓" needs
  // ZapfDingbats specifically, for both wrapText's width measurement and the actual draw.
  const dingbatsFont = await pdfDoc.embedFont(StandardFonts.ZapfDingbats)
  const fontForColumn = (key: string): typeof font => (key === 'phantomPower' ? dingbatsFont : font)

  // Table page(s) — skipped entirely for a "room layout only" export.
  if (input.include !== 'layout') {
    const orientation: PdfExportOrientation = input.orientation
    const pageWidth = orientation === 'landscape' ? LETTER_LONG : LETTER_SHORT
    const pageHeight = orientation === 'landscape' ? LETTER_SHORT : LETTER_LONG
    const usableWidth = pageWidth - 2 * MARGIN
    const dens = DENSITY[input.density]

    // Resolve every referenced piece of gear in one IN() query per gear type, instead of one
    // query per row/slot (an N+1 that hit ~200 queries on a large sheet).
    const micById = getMicsByIds(setup.items.flatMap((item) => (item.micId != null ? [item.micId] : [])))
    const preampById = getPreampsByIds(setup.items.flatMap((item) => (item.preampId != null ? [item.preampId] : [])))
    const outboardById = getOutboardByIds(
      setup.items.flatMap((item) => item.outboards.flatMap((s) => (s.outboardId != null ? [s.outboardId] : [])))
    )

    const resolvedValues = new Map<number, Record<string, string>>()
    for (const item of setup.items) {
      const mic = item.micId != null ? micById.get(item.micId) ?? null : null
      const preamp = item.preampId != null ? preampById.get(item.preampId) ?? null : null
      const isConflict = item.tieLine != null && conflicts.has(item.tieLine)

      // Consolidate every outboard slot into one comma-joined cell (empty slots skipped), in slot
      // order — the wrapping cell keeps it readable no matter how many pieces of gear a row has.
      const outboardParts: string[] = []
      for (let i = 0; i < setup.outboardColumnCount; i++) {
        const slot = item.outboards.find((s) => s.slotIndex === i)
        const outboard = slot?.outboardId != null ? outboardById.get(slot.outboardId) ?? null : null
        const text = outboard
          ? stripManufacturerPrefix(outboard.name, outboard.manufacturer ?? '')
          : slot?.outboardText ?? ''
        if (text.trim()) outboardParts.push(text.trim())
      }

      const values: Record<string, string> = {
        sourceName: item.sourceName || '',
        mic: mic ? mic.name : item.micText ?? '',
        phantomPower: item.phantomPower ? '✓' : '',
        outboard: outboardParts.join(', '),
        channel: item.channel != null ? String(item.channel) : '',
        preamp: preamp ? stripManufacturerPrefix(preamp.name, preamp.manufacturer ?? '') : item.preampText ?? '',
        tieLine: item.tieLine != null ? `${isConflict ? '⚠ ' : ''}${item.tieLine}` : '',
        cueBox: item.cueBox != null ? String(item.cueBox) : '',
        polarity: item.polarityFlip ? 'Ø' : '',
        notes: item.notes ?? ''
      }
      resolvedValues.set(item.id, values)
    }

    // Two independent filters drop columns: (1) the setup's own column-visibility choice (Source
    // name always shown), so the PDF matches what's on screen; (2) 48V, Outboard, Preamp,
    // Tie Line, Cue Box, and Polarity are additionally dropped when blank across the whole sheet.
    const itemIds = setup.items.map((item) => item.id)
    const shownColumns = new Set<string>(setup.visibleColumns)
    const omittableKeys = ['phantomPower', 'outboard', 'preamp', 'tieLine', 'cueBox', 'polarity']
    const keptColumns = COLUMNS.filter(
      (col) =>
        (col.key === 'sourceName' || shownColumns.has(col.key)) &&
        (!omittableKeys.includes(col.key) || !isColumnEmpty(col.key, itemIds, resolvedValues))
    )

    // Fit the kept columns to the page width — shrink an over-wide table, or hand slack to text
    // columns on a narrow one — so nothing ever runs off the right edge.
    const visibleColumns = fitColumns(keptColumns, usableWidth)
    const headerHeight = dens.lineHeight + dens.rowPadding + 3
    // Hoisted above drawHeaderRow/drawTitle (rather than computed after their first call, as
    // before this feature) since header shading needs it on the very first page too, not just
    // page 2+.
    const tableWidth = visibleColumns.reduce((w, c) => w + c.width, 0)

    let page = pdfDoc.addPage([pageWidth, pageHeight])
    let cursorY = pageHeight - MARGIN
    // Top of the current page's row area (bottom of the header/underline) — reset by
    // drawHeaderRow() on every page, read by drawOuterFrameForCurrentPage() to bound the frame.
    let tableTopY = 0

    const drawTitle = (): void => {
      page.drawText(`${setup.name}${setup.sessionDate ? `  —  ${setup.sessionDate}` : ''}`, {
        x: MARGIN,
        y: cursorY,
        size: 14,
        font: boldFont,
        color: accentColor ? hexToAccentRgb(accentColor) : undefined
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

      if (setup.sessionNotes) {
        const noteLines = setup.sessionNotes
          .split('\n')
          .flatMap((line) => wrapText(line, font, 9, usableWidth))
        for (const line of noteLines) {
          page.drawText(line, { x: MARGIN, y: cursorY, size: 9, font, color: rgb(0.35, 0.35, 0.35) })
          cursorY -= 12
        }
        cursorY -= 6
      }
    }

    const drawHeaderRow = (): void => {
      if (headerShaded) {
        page.drawRectangle({
          x: MARGIN - ROW_FILL_INSET,
          y: cursorY - headerHeight + dens.rowPadding,
          width: tableWidth + ROW_FILL_INSET * 2,
          height: headerHeight,
          color: accentColor ? hexToPaleRgb(accentColor) : rgb(0.9, 0.9, 0.9)
        })
      }
      const headerTextY = centeredFirstBaselineY(
        boldFont,
        dens.headerSize,
        dens.lineHeight,
        1,
        cursorY + dens.rowPadding,
        cursorY - headerHeight + dens.rowPadding
      )
      let x = MARGIN
      for (const col of visibleColumns) {
        page.drawText(col.label, { x: x + CELL_PAD, y: headerTextY, size: dens.headerSize, font: boldFont })
        x += col.width
      }
      cursorY -= headerHeight
      // Kept even when shaded — reads as a clean separator either way, and avoids a header/body
      // boundary that vanishes entirely when the shading tint is very close to white.
      page.drawLine({
        start: { x: MARGIN, y: cursorY + dens.rowPadding },
        end: { x: pageWidth - MARGIN, y: cursorY + dens.rowPadding },
        thickness: 0.5,
        color: gridLineColor
      })
      tableTopY = cursorY
    }

    /** Bounds however many rows landed on the current page with a left/right/bottom frame (the
     *  header underline already serves as the top edge). No-op unless gridStyle draws a frame.
     *  Called just before leaving a page (from startNewPage) and once more after the last row. */
    const drawOuterFrameForCurrentPage = (): void => {
      if (gridStyle !== 'full' && gridStyle !== 'outer') return
      const left = MARGIN - ROW_FILL_INSET
      const right = MARGIN + tableWidth + ROW_FILL_INSET
      page.drawLine({ start: { x: left, y: tableTopY }, end: { x: left, y: cursorY }, thickness: 0.75, color: gridLineColor })
      page.drawLine({ start: { x: right, y: tableTopY }, end: { x: right, y: cursorY }, thickness: 0.75, color: gridLineColor })
      page.drawLine({ start: { x: left, y: cursorY }, end: { x: right, y: cursorY }, thickness: 0.75, color: gridLineColor })
    }

    const startNewPage = (): void => {
      drawOuterFrameForCurrentPage()
      page = pdfDoc.addPage([pageWidth, pageHeight])
      cursorY = pageHeight - MARGIN
      drawHeaderRow()
    }

    // Which rows are the top/bottom of a linked stereo pair — two *adjacent* rows sharing a
    // non-null groupId, the same adjacency rule the table UI uses (no odd/even bucket) — used to
    // draw a "[" bracket in the left margin beside the pair. Walking one row at a time (not in
    // steps of two) lets a pair sit at any position, e.g. rows 2 & 3.
    const pairRoleById = new Map<number, 'top' | 'bottom'>()
    for (let i = 0; i + 1 < setup.items.length; i++) {
      const top = setup.items[i]
      const bottom = setup.items[i + 1]
      // Skip the bottom row of a pair we just recorded, so a run of same-group rows doesn't
      // double-bracket (only pairs are supported; a groupId is shared by exactly two adjacent rows).
      if (pairRoleById.get(top.id) === 'bottom') continue
      if (top.groupId != null && top.groupId === bottom.groupId) {
        pairRoleById.set(top.id, 'top')
        pairRoleById.set(bottom.id, 'bottom')
      }
    }
    const bracketColor = accentColor ? hexToAccentRgb(accentColor) : rgb(0.35, 0.35, 0.35)

    drawTitle()
    drawHeaderRow()

    let visualRowIndex = 0
    for (const item of setup.items) {
      const values = resolvedValues.get(item.id)!

      // Wrap every cell to its column width, then size the row to the tallest cell.
      const wrappedByKey = new Map<string, string[]>()
      let maxLines = 1
      for (const col of visibleColumns) {
        const lines = wrapText(values[col.key] ?? '', fontForColumn(col.key), dens.bodySize, col.width - 2 * CELL_PAD)
        wrappedByKey.set(col.key, lines)
        if (lines.length > maxLines) maxLines = lines.length
      }
      const rowHeight = maxLines * dens.lineHeight + dens.rowPadding

      // Page-break before drawing when this row won't fit (height-aware). A row taller than a whole
      // page body is pathological; we still draw it from the top of a fresh page and let it run.
      if (cursorY - rowHeight < MARGIN) {
        startNewPage()
      }

      const rowBottomY = cursorY - rowHeight + dens.rowPadding
      const usesCustomColor = input.coloredRows && !!item.color
      const isOddRow = zebraStripes && visualRowIndex % 2 === 1
      if (usesCustomColor) {
        // Zebra striping alternates the SAME row color between a light and dark tint, rather than
        // being suppressed by custom colors entirely — otherwise a fully colored sheet would show
        // no zebra pattern at all, since every row would take this branch over the plain-gray one.
        page.drawRectangle({
          x: MARGIN - ROW_FILL_INSET,
          y: rowBottomY,
          width: tableWidth + ROW_FILL_INSET * 2,
          height: rowHeight,
          color: isOddRow ? hexToPaleRgbDark(item.color!) : hexToPaleRgb(item.color!)
        })
      } else if (isOddRow) {
        // Always neutral gray, independent of any accent color — zebra stays a subtle scan aid
        // separate from the accent's role on the header/lines/title.
        page.drawRectangle({
          x: MARGIN - ROW_FILL_INSET,
          y: rowBottomY,
          width: tableWidth + ROW_FILL_INSET * 2,
          height: rowHeight,
          color: rgb(0.93, 0.93, 0.93)
        })
      }

      const rowTopY = cursorY + dens.rowPadding

      // Stereo-pair bracket "[" in the left margin: a vertical spine spanning this row, plus an
      // inward tick at the outer edge (top of the top row, bottom of the bottom row). The two rows'
      // halves join into one bracket. Drawn per-row so a pair split across a page break still reads.
      const linkRole = pairRoleById.get(item.id)
      if (linkRole) {
        const spineX = MARGIN - 9
        const tickX = MARGIN - 3
        page.drawLine({
          start: { x: spineX, y: rowBottomY },
          end: { x: spineX, y: rowTopY },
          thickness: 1,
          color: bracketColor
        })
        const tickY = linkRole === 'top' ? rowTopY : rowBottomY
        page.drawLine({ start: { x: spineX, y: tickY }, end: { x: tickX, y: tickY }, thickness: 1, color: bracketColor })
      }

      let x = MARGIN
      for (const col of visibleColumns) {
        const lines = wrappedByKey.get(col.key)!
        const colFont = fontForColumn(col.key)
        // Each cell centers on its OWN line count within the shared row box, rather than every
        // column sharing the row's top-most baseline — a 1-line cell in a 2-line row shouldn't
        // sit flush with the top, it should center in the same box the grid lines draw around it.
        const firstLineY = centeredFirstBaselineY(colFont, dens.bodySize, dens.lineHeight, lines.length, rowTopY, rowBottomY)
        lines.forEach((line, i) => {
          page.drawText(line, {
            x: x + CELL_PAD,
            y: firstLineY - i * dens.lineHeight,
            size: dens.bodySize,
            font: colFont
          })
        })
        x += col.width
      }

      if (gridStyle === 'full' || gridStyle === 'rows') {
        page.drawLine({
          start: { x: MARGIN - ROW_FILL_INSET, y: rowBottomY },
          end: { x: MARGIN + tableWidth + ROW_FILL_INSET, y: rowBottomY },
          thickness: 0.5,
          color: gridLineColor
        })
      }
      if (gridStyle === 'full') {
        let colX = MARGIN
        for (let i = 0; i < visibleColumns.length - 1; i++) {
          colX += visibleColumns[i].width
          page.drawLine({
            start: { x: colX, y: rowTopY },
            end: { x: colX, y: rowBottomY },
            thickness: 0.5,
            color: gridLineColor
          })
        }
      }

      cursorY -= rowHeight
      visualRowIndex++
    }

    drawOuterFrameForCurrentPage()
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
