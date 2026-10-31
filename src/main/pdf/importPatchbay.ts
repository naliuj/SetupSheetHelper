import { dialog } from 'electron'
import { copyFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { PatchbayFile, PatchbayWithPoints, PatchPoint, PickedPatchbayFile } from '@shared/types/patchbay'
import { getPatchbaysDir } from '../userDataPaths'
import {
  getCachedPatchPoints,
  getPatchbayFileForStudio,
  setCachedPatchPoints,
  upsertPatchbayFile
} from '../db/repositories/patchbayFileRepo'
import { PATCH_POINTS_VERSION, readPatchbayPdf } from './detectPatchPoints'

/** Paths a patchbay file dialog has handed back — the same guard as importLayoutFile.ts: the
 *  commit call arrives over IPC with a path in hand, and only a file the user actually picked may
 *  be copied in and served. */
const pickedPaths = new Set<string>()

function assertStudioId(id: number): void {
  // Interpolated into a filename, so a plain row id and nothing else.
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid studio id.')
}

export async function pickPatchbayFile(): Promise<PickedPatchbayFile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Patchbay PDF',
    properties: ['openFile'],
    filters: [{ name: 'Patchbay PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const sourcePath = result.filePaths[0]
  pickedPaths.add(sourcePath)
  return { sourcePath, fileName: basename(sourcePath) }
}

/** Copies a picked PDF in as the studio's patchbay, reading its size and jacks on the way. */
export async function commitPickedPatchbayToStudio(studioId: number, sourcePath: string): Promise<PatchbayFile> {
  if (!pickedPaths.has(sourcePath)) throw new Error('That patchbay file was not chosen from a file picker.')
  assertStudioId(studioId)
  // Read before copying, so a file that isn't a readable PDF never replaces the current one.
  const { widthPt, heightPt, points } = await readPatchbayPdf(sourcePath)
  const destPath = join(getPatchbaysDir(), `studio_${studioId}.pdf`)
  copyFileSync(sourcePath, destPath)
  const file = upsertPatchbayFile({
    studioId,
    filePath: destPath,
    originalName: basename(sourcePath),
    pageWidthPt: widthPt,
    pageHeightPt: heightPt
  })
  setCachedPatchPoints(studioId, points, PATCH_POINTS_VERSION)
  return file
}

export async function importPatchbayForStudio(studioId: number): Promise<PatchbayFile | null> {
  const picked = await pickPatchbayFile()
  return picked ? commitPickedPatchbayToStudio(studioId, picked.sourcePath) : null
}

/** A studio's patchbay file alone, without detecting its jacks — all the Studio Setup card needs.
 *  Null when it has none or its copy is missing, as below. */
export function getPatchbayFile(studioId: number): PatchbayFile | null {
  const file = getPatchbayFileForStudio(studioId)
  return file && existsSync(file.filePath) ? file : null
}

/** A studio's patchbay with its jacks. Jacks are detected on first load (bundled Berklee drawings
 *  are attached without them) and again whenever the detector changes, then cached. */
export async function getPatchbayWithPoints(studioId: number): Promise<PatchbayWithPoints | null> {
  const file = getPatchbayFileForStudio(studioId)
  if (!file || !existsSync(file.filePath)) return null
  let points: PatchPoint[] | null = getCachedPatchPoints(studioId, PATCH_POINTS_VERSION)
  if (!points) {
    try {
      points = (await readPatchbayPdf(file.filePath)).points
    } catch {
      points = []
    }
    setCachedPatchPoints(studioId, points, PATCH_POINTS_VERSION)
  }
  return { file, points }
}
