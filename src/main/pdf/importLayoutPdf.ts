import { dialog } from 'electron'
import { copyFileSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { RoomLayoutPdf } from '@shared/types/entities'
import { getLayoutsDir } from '../userDataPaths'
import { upsertLayoutPdf } from '../db/repositories/roomLayoutPdfRepo'

async function getPdfPageSize(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(readFileSync(filePath))
    const doc = await pdfjsLib.getDocument({ data }).promise
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    return { width: viewport.width, height: viewport.height }
  } catch {
    return null
  }
}

export async function importLayoutPdfForStudio(studioId: number): Promise<RoomLayoutPdf | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Room Layout PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const destPath = join(getLayoutsDir(), `studio_${studioId}.pdf`)
  copyFileSync(sourcePath, destPath)

  const size = await getPdfPageSize(destPath)

  return upsertLayoutPdf({
    studioId,
    filePath: destPath,
    originalName: basename(sourcePath),
    pageWidthPt: size?.width ?? null,
    pageHeightPt: size?.height ?? null
  })
}
