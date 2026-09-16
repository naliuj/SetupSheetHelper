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
import {
  formatPdfDate,
  parsePdfAccentColor,
  parsePdfBoolSetting,
  parsePdfDateFormat,
  parsePdfGridStyle
} from '@shared/constants/pdfLayout'
import { getSetupWithItems } from '../db/repositories/setupsRepo'
import { getStudio } from '../db/repositories/studiosRepo'
import { listBuildings } from '../db/repositories/buildingsRepo'
import { getMicsByIds } from '../db/repositories/micsRepo'
import { getOutboardByIds } from '../db/repositories/outboardRepo'
import { getPreampsByIds } from '../db/repositories/preampRepo'
import { getSetting } from '../db/repositories/settingsRepo'
import { resolveMicText, resolveOutboardSlotText, resolvePreampText } from '../db/resolveGearLabels'
import { fitColumns, sanitizeForWinAnsi, wrapText, type ColumnSpec } from './pdfLayout'
import { orderedVisibleColumns } from '@shared/constants/setupColumns'
import { isHexColor } from '@shared/constants/swatches'
import {
  STEREO_BRACE_BOTTOM,
  STEREO_BRACE_STROKE,
  STEREO_BRACE_TOP,
  scaleBracePath
} from '@shared/constants/stereoBrace'
import { layoutPixelsToPoints } from '@shared/constants/roomLayout'

/** Short alias for sanitizeForWinAnsi — applied to every user-supplied string before it is
 *  measured or drawn, so one unencodable character cannot abort the export. */
const safe = sanitizeForWinAnsi

// US Letter, points. Portrait is the short edge (612) horizontal; landscape swaps them.
const LETTER_SHORT = 612
const LETTER_LONG = 792
const MARGIN = 36
const CELL_PAD = 2 // horizontal breathing room inside a cell, each side
// Shared left/right inset for every filled rectangle and frame (row tint, zebra band, header
// shading, outer grid frame) so their edges all line up instead of drifting by a point or two.
const ROW_FILL_INSET = 2

/** How wide the stereo brace is drawn in the PDF, and how far its right edge sits from the table.
 *  The old bracket used 6pt of margin; the brace needs more for its curls, and the left margin has
 *  the room — it is 36pt and otherwise empty. */
const BRACE_WIDTH_PT = 11
const BRACE_MARGIN_GAP = 4

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

/** `line` with a trailing ellipsis, shortened character by character until it fits `width`.
 *  U+2026 is WinAnsi (0x85) and measures in Helvetica, so it needs no sanitising. */
function withEllipsis(line: string, font: PDFFont, size: number, width: number): string {
  const ellipsis = '\u2026'
  let text = line.trimEnd()
  while (text.length > 0 && font.widthOfTextAtSize(text + ellipsis, size) > width) {
    text = text.slice(0, -1).trimEnd()
  }
  return text + ellipsis
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

  const conflicts = findTieLineConflicts(setup.items)

  // Which room this sheet is for was never printed anywhere on it — the one thing a person
  // holding the paper in a corridor of near-identical control rooms most needs. Quick Setup's
  // throwaway studio is skipped (it is a placeholder named "Quick Setup", not a room), and the
  // building is appended when there is one, since "Studio A" alone is ambiguous across buildings
  // — the same `Name (Building)` shape the import picker already uses.
  const studio = getStudio(setup.studioId)
  const buildingName =
    studio && studio.buildingId != null
      ? (listBuildings().find((b) => b.id === studio.buildingId)?.name ?? null)
      : null
  const studioLabel =
    studio && !studio.isTemporary ? `${studio.name}${buildingName ? ` (${buildingName})` : ''}` : null

  // Table style is a global, persistent preference (Settings > PDF Layout), not a per-export
  // option — read directly here rather than threading it through ExportSetupPdfInput, the same
  // way setupsRepo reads defaultVisibleColumns.
  const gridStyle = parsePdfGridStyle(getSetting(APP_SETTINGS_KEYS.pdfGridStyle))
  const zebraStripes = parsePdfBoolSetting(getSetting(APP_SETTINGS_KEYS.pdfZebraStripes))
  const headerShaded = parsePdfBoolSetting(getSetting(APP_SETTINGS_KEYS.pdfHeaderShaded))
  const accentColor = parsePdfAccentColor(getSetting(APP_SETTINGS_KEYS.pdfAccentColor))
  const dateFormat = parsePdfDateFormat(getSetting(APP_SETTINGS_KEYS.pdfDateFormat))
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
      const isConflict = item.tieLine != null && conflicts.has(item.tieLine)

      // Consolidate every outboard slot into one comma-joined cell (empty slots skipped), in slot
      // order — the wrapping cell keeps it readable no matter how many pieces of gear a row has.
      const outboardParts: string[] = []
      for (let i = 0; i < setup.outboardColumnCount; i++) {
        const slot = item.outboards.find((s) => s.slotIndex === i) ?? { slotIndex: i, outboardId: null, outboardText: null }
        const text = resolveOutboardSlotText(slot, outboardById).trim()
        if (text) outboardParts.push(text)
      }

      // Every value here is drawn in Helvetica (WinAnsi) and so must be sanitised — see
      // sanitizeForWinAnsi. The one exception is phantomPower: it is our own glyph, drawn in
      // ZapfDingbats via fontForColumn, and sanitising it would replace the check mark.
      const values: Record<string, string> = {
        sourceName: safe(item.sourceName || ''),
        mic: safe(resolveMicText(item, micById)),
        phantomPower: item.phantomPower ? '✓' : '',
        outboard: safe(outboardParts.join(', ')),
        channel: item.channel != null ? String(item.channel) : '',
        preamp: safe(resolvePreampText(item, preampById)),
        // '!' rather than a warning glyph: U+26A0 is absent from WinAnsi AND from ZapfDingbats,
        // and this column draws in Helvetica. Measuring it threw before a byte was written, so a
        // duplicated tie line — which is what this marker exists to flag — failed the whole
        // export. See the note on the check mark above fontForColumn for the same hazard.
        tieLine: item.tieLine != null ? `${isConflict ? '! ' : ''}${item.tieLine}` : '',
        cueBox: safe(item.cueBox ?? ''),
        polarity: item.polarityFlip ? 'Ø' : '',
        notes: safe(item.notes ?? '')
      }
      resolvedValues.set(item.id, values)
    }

    // Which columns get printed. Normally the renderer's export chips have already decided —
    // `includeColumns` is the resolved, ordered list the user saw and could flip — so it's taken
    // verbatim and the blank-column auto-drop below is skipped entirely (the chips already showed
    // which columns are empty and let the user include one anyway). COLUMNS is only a label/width
    // lookup. 'sourceName' is always leftmost and never a chip; 'stereoLink' has no PDF column at
    // all — it's drawn as a margin bracket instead.
    const columnByKey = new Map(COLUMNS.map((col) => [col.key, col]))
    const toSpecs = (keys: string[]): ColumnSpec[] =>
      ['sourceName', ...keys.filter((k) => k !== 'stereoLink')]
        .map((key) => columnByKey.get(key))
        .filter((col): col is ColumnSpec => col != null)

    let keptColumns: ColumnSpec[]
    if (input.includeColumns) {
      keptColumns = toSpecs(input.includeColumns)
    } else {
      // Fallback for callers that predate the chips: the setup's own visibility/order choice, with
      // 48V, Outboard, Preamp, Tie Line, Cue Box and Polarity additionally dropped when blank
      // across the whole sheet.
      const itemIds = setup.items.map((item) => item.id)
      const omittableKeys = ['phantomPower', 'outboard', 'preamp', 'tieLine', 'cueBox', 'polarity']
      keptColumns = toSpecs(orderedVisibleColumns(setup.columnOrder, setup.visibleColumns)).filter(
        (col) => !omittableKeys.includes(col.key) || !isColumnEmpty(col.key, itemIds, resolvedValues)
      )
    }

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
    // Top of the current page's row area — the header underline's y, which is also the first
    // row's rowTopY. Reset by drawHeaderRow() on every page, read by
    // drawOuterFrameForCurrentPage() to bound the frame.
    let tableTopY = 0

    const drawTitle = (): void => {
      // The title block is drawn before any table exists, so it needs its own page break:
      // startNewPage() would stamp column headers onto what is still the cover area.
      const titleNewPage = (): void => {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        cursorY = pageHeight - MARGIN
      }

      /** Draws pre-wrapped lines, breaking to a new page rather than off the bottom of this one.
       *  Without the bound, long session notes were drawn at a negative y — written to the file
       *  but invisible — and, worse, left cursorY negative so the table's own column headers were
       *  drawn off-page too and page one came out blank below the title. */
      const drawBlockLines = (
        lines: string[],
        size: number,
        lineGap: number,
        lineFont: PDFFont,
        color?: ReturnType<typeof rgb>
      ): void => {
        for (const line of lines) {
          if (cursorY < MARGIN + size) titleNewPage()
          page.drawText(line, { x: MARGIN, y: cursorY, size, font: lineFont, color })
          cursorY -= lineGap
        }
      }

      const formattedDate = setup.sessionDate ? formatPdfDate(setup.sessionDate, dateFormat) : null
      // Wrapped, not drawn blind: a setup name of ~55 characters plus an appended date runs past
      // the right margin, and this file has had a working wrapText all along.
      const titleText = `${safe(setup.name)}${formattedDate ? `  \u2014  ${formattedDate}` : ''}`
      drawBlockLines(
        wrapText(titleText, boldFont, 14, usableWidth),
        14,
        18,
        boldFont,
        accentColor ? hexToAccentRgb(accentColor) : undefined
      )

      const metaParts: string[] = []
      if (studioLabel) metaParts.push(`Studio: ${safe(studioLabel)}`)
      if (setup.engineer) metaParts.push(`Engineer: ${safe(setup.engineer)}`)
      if (setup.artist) metaParts.push(`Artist: ${safe(setup.artist)}`)
      if (metaParts.length > 0) {
        // Separated, not just spaced. Three spaces render narrow at 10pt, and with a third field
        // in front of Engineer the line ran together — "Studio 2 (160) Engineer" reads as one
        // phrase. U+00B7 is WinAnsi (0xB7) and is the same separator the app uses on screen.
        drawBlockLines(wrapText(metaParts.join(' \u00b7 '), font, 10, usableWidth), 10, 18, font)
      } else {
        cursorY -= 6
      }

      if (setup.sessionNotes) {
        // wrapText splits on newlines itself, so paragraphs survive without pre-splitting here.
        drawBlockLines(
          wrapText(safe(setup.sessionNotes), font, 9, usableWidth),
          9,
          12,
          font,
          rgb(0.35, 0.35, 0.35)
        )
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
      // The underline's y, NOT the bare cursor: cursorY is rowPadding below it, and a frame
      // bounded by the bare cursor overhangs the row band by that much at both ends. At the
      // bottom that overhang drew as a short empty row after the last row of content.
      tableTopY = cursorY + dens.rowPadding
    }

    /** Bounds however many rows landed on the current page with a left/right/bottom frame (the
     *  header underline already serves as the top edge). No-op unless gridStyle draws a frame.
     *  Called just before leaving a page (from startNewPage) and once more after the last row. */
    const drawOuterFrameForCurrentPage = (): void => {
      if (gridStyle !== 'full' && gridStyle !== 'outer') return
      const left = MARGIN - ROW_FILL_INSET
      const right = MARGIN + tableWidth + ROW_FILL_INSET
      // Every row spans [cursorY - rowHeight + rowPadding, cursorY + rowPadding] — the padding
      // shifts the whole band up off the bare cursor. So the frame has to be offset the same way,
      // or it closes rowPadding BELOW the last row's own bottom line and the gap between the two
      // reads as a short, empty, fully ruled row. Same offset already baked into tableTopY.
      const bottom = cursorY + dens.rowPadding
      page.drawLine({ start: { x: left, y: tableTopY }, end: { x: left, y: bottom }, thickness: 0.75, color: gridLineColor })
      page.drawLine({ start: { x: right, y: tableTopY }, end: { x: right, y: bottom }, thickness: 0.75, color: gridLineColor })
      page.drawLine({ start: { x: left, y: bottom }, end: { x: right, y: bottom }, thickness: 0.75, color: gridLineColor })
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
      let rowHeight = maxLines * dens.lineHeight + dens.rowPadding

      // Page-break before drawing when this row won't fit (height-aware).
      if (cursorY - rowHeight < MARGIN) {
        startNewPage()
      }

      // Still taller than a whole page body even on a fresh page — reachable with a pasted
      // paragraph in Notes, which is ~65 lines in a narrow column. It used to be drawn at full
      // height and allowed to run off the bottom: the overflow was written into the file but fell
      // outside the page box, so it vanished with nothing to say it had. Keep what fits and mark
      // every cell that lost lines, so the loss is visible rather than silent.
      const linesThatFit = Math.max(1, Math.floor((cursorY - MARGIN - dens.rowPadding) / dens.lineHeight))
      if (maxLines > linesThatFit) {
        for (const col of visibleColumns) {
          const lines = wrappedByKey.get(col.key)!
          if (lines.length <= linesThatFit) continue
          const kept = lines.slice(0, linesThatFit)
          kept[kept.length - 1] = withEllipsis(
            kept[kept.length - 1],
            fontForColumn(col.key),
            dens.bodySize,
            col.width - 2 * CELL_PAD
          )
          wrappedByKey.set(col.key, kept)
        }
        maxLines = linesThatFit
        rowHeight = maxLines * dens.lineHeight + dens.rowPadding
      }

      const rowBottomY = cursorY - rowHeight + dens.rowPadding
      const usesCustomColor = input.coloredRows && isHexColor(item.color)
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

      // Stereo-pair brace in the left margin, from the SAME path the table draws (see
      // stereoBrace.ts). The square bracket this replaces was built from two drawLine calls here
      // and CSS borders on screen — two definitions of one shape, which is exactly how they drifted
      // apart. Drawn per-row so a pair split across a page break still reads, and scaled to each
      // row's own height so unequal rows still meet at the spike.
      //
      // drawSvgPath's y is the TOP of the path box and its y axis runs downward, unlike the rest of
      // this file.
      const linkRole = pairRoleById.get(item.id)
      if (linkRole) {
        const braceHeight = rowTopY - rowBottomY
        page.drawSvgPath(
          scaleBracePath(linkRole === 'top' ? STEREO_BRACE_TOP : STEREO_BRACE_BOTTOM, BRACE_WIDTH_PT, braceHeight),
          {
            x: MARGIN - BRACE_MARGIN_GAP - BRACE_WIDTH_PT,
            y: rowTopY,
            borderColor: bracketColor,
            borderWidth: STEREO_BRACE_STROKE,
            borderLineCap: 1
          }
        )
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

    // Sized from the capture itself, not from a layout record. Two reasons. The record this used
    // to read was the STUDIO's shared layout, while the renderer captures the EFFECTIVE one (a
    // per-setup override wins) — so a setup with its own layout in a studio that has none fell
    // through to `imgDims` in POINTS and produced a 44x34 inch page. And even the right record
    // would be the wrong box: exportStageToDataUrl captures getClientRect over ALL content, so a
    // block dragged past the edge of the floor plan makes the image larger than the page.
    // Converting the pixels back is exact for the cases that do have a known size — a 3168px
    // capture of a 792pt plan converts to 792pt.
    const pageWidth = layoutPixelsToPoints(imgDims.width)
    const pageHeight = layoutPixelsToPoints(imgDims.height)
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
