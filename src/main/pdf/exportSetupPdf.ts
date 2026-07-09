import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import type { ExportSetupPdfInput, ExportSetupPdfResult } from '@shared/types/ipc'
import { getSetupWithItems } from '../db/repositories/setupsRepo'
import { getLayoutFileForStudio } from '../db/repositories/roomLayoutFileRepo'
import { getMicById } from '../db/repositories/micsRepo'
import { getOutboardById } from '../db/repositories/outboardRepo'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'

const PAGE_WIDTH = 612 // US Letter, portrait, points
const PAGE_HEIGHT = 792
const MARGIN = 36
const ROW_HEIGHT = 22
const HEADER_HEIGHT = 24

const COLUMNS = [
  { key: 'sourceName', label: 'Source Name', width: 90 },
  { key: 'mic', label: 'Microphone', width: 90 },
  { key: 'outboard', label: 'Outboard', width: 90 },
  { key: 'channel', label: 'Channel', width: 45 },
  { key: 'tieLine', label: 'Tie Line', width: 55 },
  { key: 'cueBox', label: 'Cue Box', width: 55 },
  { key: 'polarity', label: 'Polarity', width: 55 },
  { key: 'notes', label: 'Notes', width: 60 }
] as const

function findTieLineConflicts(items: { tieLine: number | null }[]): Set<number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    if (item.tieLine == null) continue
    counts.set(item.tieLine, (counts.get(item.tieLine) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([tieLine]) => tieLine))
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
      for (const col of COLUMNS) {
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

    for (const item of setup.items) {
      if (cursorY < MARGIN + ROW_HEIGHT) {
        startNewPage()
      }

      const mic = item.micId != null ? getMicById(item.micId) : null
      const outboard = item.outboardId != null ? getOutboardById(item.outboardId) : null
      const isConflict = item.tieLine != null && conflicts.has(item.tieLine)

      const values: Record<(typeof COLUMNS)[number]['key'], string> = {
        sourceName: item.sourceName || '',
        mic: mic ? mic.name : item.micText ?? '',
        outboard: outboard ? stripManufacturerPrefix(outboard.name, outboard.manufacturer ?? '') : item.outboardText ?? '',
        channel: item.channel != null ? String(item.channel) : '',
        tieLine: item.tieLine != null ? `${isConflict ? '⚠ ' : ''}${item.tieLine}` : '',
        cueBox: item.cueBox != null ? String(item.cueBox) : '',
        polarity: item.polarityFlip ? 'Yes' : '',
        notes: item.notes ?? ''
      }

      let x = MARGIN
      for (const col of COLUMNS) {
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
