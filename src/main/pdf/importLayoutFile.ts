import { dialog } from 'electron'
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { RoomLayoutFile } from '@shared/types/entities'
import { getLayoutsDir } from '../userDataPaths'
import { getLayoutFileForStudio, upsertLayoutFile } from '../db/repositories/roomLayoutFileRepo'

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

export async function importLayoutFileForStudio(studioId: number): Promise<RoomLayoutFile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Room Layout File',
    properties: ['openFile'],
    filters: [{ name: 'Layout File', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const extension = extname(sourcePath).toLowerCase()
  const destPath = join(getLayoutsDir(), `studio_${studioId}${extension}`)

  // Replacing a layout that had a different extension (e.g. swapping a PDF for a PNG) would
  // otherwise leave the old file orphaned on disk — best-effort cleanup, not critical if it fails.
  const previous = getLayoutFileForStudio(studioId)
  if (previous && previous.filePath !== destPath && existsSync(previous.filePath)) {
    try {
      unlinkSync(previous.filePath)
    } catch {
      // non-critical
    }
  }

  copyFileSync(sourcePath, destPath)

  const size = extension === '.pdf' ? await getPdfPageSize(destPath) : null

  return upsertLayoutFile({
    studioId,
    filePath: destPath,
    originalName: basename(sourcePath),
    pageWidthPt: size?.width ?? null,
    pageHeightPt: size?.height ?? null
  })
}
