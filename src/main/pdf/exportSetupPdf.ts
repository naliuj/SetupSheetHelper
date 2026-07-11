import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import type { ExportSetupPdfInput, ExportSetupPdfResult } from '@shared/types/ipc'
import { getSetupWithItems } from '../db/repositories/setupsRepo'
import { getLayoutFileForStudio } from '../db/repositories/roomLayoutFileRepo'
import { getMicById } from '../db/repositories/micsRepo'
import { getOutboardById } from '../db/repositories/outboardRepo'
import { getPreampById } from '../db/repositories/preampRepo'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'

const PAGE_WIDTH = 612 // US Letter, portrait, points
const PAGE_HEIGHT = 792
const MARGIN = 36
const ROW_HEIGHT = 22
const HEADER_HEIGHT = 24

const STATIC_COLUMNS_BEFORE_OUTBOARD = [
  { key: 'sourceName', label: 'Source Name', width: 80 },
  { key: 'mic', label: 'Microphone', width: 80 }
] as const

const STATIC_COLUMNS_AFTER_OUTBOARD = [
  { key: 'channel', label: 'Channel', width: 40 },
  { key: 'preamp', label: 'Preamp', width: 55 },
  { key: 'tieLine', label: 'Tie Line', width: 45 },
  { key: 'cueBox', label: 'Cue Box', width: 45 },
  { key: 'polarity', label: 'Polarity', width: 50 },
  { key: 'notes', label: 'Notes', width: 70 }
] as const

interface RenderColumn {
  key: string
  label: string
  width: number
}

function buildOutboardColumns(outboardColumnCount: number): RenderColumn[] {
  return Array.from({ length: outboardColumnCount }, (_, i) => ({
    key: `outboard_${i}`,
    label: i === 0 ? 'Outboard' : `Outboard ${i + 1}`,
    width: 75
  }))
}

/** True if every row is blank for this column key — such a column is omitted entirely rather
 *  than printing a useless blank strip (independently per column: outboard and preamp are
 *  unrelated, and each outboard slot is checked on its own). */
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
    const outboardColumns = buildOutboardColumns(setup.outboardColumnCount)
    const allColumns: RenderColumn[] = [
      ...STATIC_COLUMNS_BEFORE_OUTBOARD,
      ...outboardColumns,
      ...STATIC_COLUMNS_AFTER_OUTBOARD
    ]

    const resolvedValues = new Map<number, Record<string, string>>()
    for (const item of setup.items) {
      const mic = item.micId != null ? getMicById(item.micId) : null
      const preamp = item.preampId != null ? getPreampById(item.preampId) : null
      const isConflict = item.tieLine != null && conflicts.has(item.tieLine)
      const values: Record<string, string> = {
        sourceName: item.sourceName || '',
        mic: mic ? mic.name : item.micText ?? '',
        channel: item.channel != null ? String(item.channel) : '',
        preamp: preamp ? stripManufacturerPrefix(preamp.name, preamp.manufacturer ?? '') : item.preampText ?? '',
        tieLine: item.tieLine != null ? `${isConflict ? '⚠ ' : ''}${item.tieLine}` : '',
        cueBox: item.cueBox != null ? String(item.cueBox) : '',
        polarity: item.polarityFlip ? 'Yes' : '',
        notes: item.notes ?? ''
      }
      for (let i = 0; i < setup.outboardColumnCount; i++) {
        const slot = item.outboards.find((s) => s.slotIndex === i)
        const outboard = slot?.outboardId != null ? getOutboardById(slot.outboardId) : null
        values[`outboard_${i}`] = outboard
          ? stripManufacturerPrefix(outboard.name, outboard.manufacturer ?? '')
          : slot?.outboardText ?? ''
      }
      resolvedValues.set(item.id, values)
    }

    // Preamp and every outboard slot are each independently omittable if blank across the
    // whole sheet; every other column always shows.
    const itemIds = setup.items.map((item) => item.id)
    const omittableKeys = ['preamp', ...outboardColumns.map((col) => col.key)]
    const visibleColumns = allColumns.filter(
      (col) => !omittableKeys.includes(col.key) || !isColumnEmpty(col.key, itemIds, resolvedValues)
    )

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let cursorY = PAGE_HEIGHT - MARGIN

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
        page.drawText(col.label, { x, y: cursorY, size: 9, font: boldFont })
        x += col.width
      }
      cursorY -= HEADER_HEIGHT
      page.drawLine({
        start: { x: MARGIN, y: cursorY + 6 },
        end: { x: PAGE_WIDTH - MARGIN, y: cursorY + 6 },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6)
      })
    }

    const startNewPage = (): void => {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      cursorY = PAGE_HEIGHT - MARGIN
      drawHeaderRow()
    }

    drawTitle()
    drawHeaderRow()

    const tableWidth = visibleColumns.reduce((w, c) => w + c.width, 0)

    for (const item of setup.items) {
      if (cursorY < MARGIN + ROW_HEIGHT) {
        startNewPage()
      }

      if (input.coloredRows && item.color) {
        page.drawRectangle({
          x: MARGIN - 2,
          y: cursorY - 5,
          width: tableWidth + 4,
          height: ROW_HEIGHT,
          color: hexToPaleRgb(item.color)
        })
      }

      const values = resolvedValues.get(item.id)!

      let x = MARGIN
      for (const col of visibleColumns) {
        const text = values[col.key]
        page.drawText(text.length > 40 ? `${text.slice(0, 37)}...` : text, {
          x,
          y: cursorY,
          size: 9,
          font
        })
        x += col.width
      }
      cursorY -= ROW_HEIGHT
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
