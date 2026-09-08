import { dialog } from 'electron'
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { RoomLayoutFile, SetupLayoutOverride } from '@shared/types/entities'
import { getLayoutsDir } from '../userDataPaths'
import { getLayoutFileForStudio, upsertLayoutFile } from '../db/repositories/roomLayoutFileRepo'
import { getSetupLayoutOverride, upsertFileLayoutOverride } from '../db/repositories/setupLayoutOverrideRepo'

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

export interface PickedLayoutFile {
  sourcePath: string
  fileName: string
}

/** Paths a file dialog in this module has actually handed back.
 *
 *  The commit functions below are reachable over IPC and take the path as an argument, on a round
 *  trip entirely separate from the pick that produced it. Nothing tied the two together, so any
 *  path at all could be named and would be copied into the layouts directory under a predictable
 *  name that the app then serves over app-file://. Gating on this set means only files the user
 *  actually chose in a dialog can be committed. Entries are kept for the process lifetime: the
 *  same pick is legitimately committed more than once (studio, then setup, or a retry). */
const pickedPaths = new Set<string>()

function assertPicked(sourcePath: string): void {
  if (!pickedPaths.has(sourcePath)) {
    throw new Error('That layout file was not chosen from a file picker.')
  }
}

/** Interpolated straight into a filename, so it has to be a plain row id and nothing else. */
function assertRowId(id: number, label: string): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid ${label}.`)
  }
}

/** Just the file-picker step, no disk/DB writes — lets a caller decide afterward where (or
 *  whether) to commit the pick. */
export async function pickLayoutFile(): Promise<PickedLayoutFile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Room Layout File',
    properties: ['openFile'],
    filters: [{ name: 'Layout File', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  pickedPaths.add(sourcePath)
  return { sourcePath, fileName: basename(sourcePath) }
}

export async function commitPickedLayoutFileToStudio(studioId: number, sourcePath: string): Promise<RoomLayoutFile> {
  assertRowId(studioId, 'studio id')
  assertPicked(sourcePath)
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

export async function importLayoutFileForStudio(studioId: number): Promise<RoomLayoutFile | null> {
  const picked = await pickLayoutFile()
  if (!picked) return null
  return commitPickedLayoutFileToStudio(studioId, picked.sourcePath)
}

/** Same shape as commitPickedLayoutFileToStudio, but scoped to a single setup — a disjoint file
 *  (setup_<id>.<ext> vs studio_<id>.<ext>, same getLayoutsDir(), no collision) and a disjoint DB
 *  row (setup_layout_overrides, not room_layout_files) that never touches the studio's shared
 *  layout. */
export async function commitPickedLayoutFileToSetup(
  setupId: number,
  sourcePath: string
): Promise<SetupLayoutOverride> {
  assertRowId(setupId, 'setup id')
  assertPicked(sourcePath)
  const extension = extname(sourcePath).toLowerCase()
  const destPath = join(getLayoutsDir(), `setup_${setupId}${extension}`)

  const previous = getSetupLayoutOverride(setupId)
  if (previous?.filePath && previous.filePath !== destPath && existsSync(previous.filePath)) {
    try {
      unlinkSync(previous.filePath)
    } catch {
      // non-critical
    }
  }

  copyFileSync(sourcePath, destPath)

  const size = extension === '.pdf' ? await getPdfPageSize(destPath) : null

  return upsertFileLayoutOverride({
    setupId,
    filePath: destPath,
    originalName: basename(sourcePath),
    pageWidthPt: size?.width ?? null,
    pageHeightPt: size?.height ?? null
  })
}
