import { rmSync } from 'node:fs'
import type { PatchbayFile, PatchPoint } from '@shared/types/patchbay'
import { getDb } from '../index'

interface PatchbayFileRow {
  id: number
  studio_id: number
  file_path: string
  original_name: string | null
  page_width_pt: number
  page_height_pt: number
  points_json: string | null
  points_version: number | null
  imported_at: string
}

function mapRow(row: PatchbayFileRow): PatchbayFile {
  return {
    id: row.id,
    studioId: row.studio_id,
    filePath: row.file_path,
    originalName: row.original_name,
    pageWidthPt: row.page_width_pt,
    pageHeightPt: row.page_height_pt,
    importedAt: row.imported_at
  }
}

function getRow(studioId: number): PatchbayFileRow | undefined {
  return getDb().prepare('SELECT * FROM patchbay_files WHERE studio_id = ?').get(studioId) as
    PatchbayFileRow | undefined
}

export function getPatchbayFileForStudio(studioId: number): PatchbayFile | null {
  const row = getRow(studioId)
  return row ? mapRow(row) : null
}

/** The cached jack map, or null when it was never detected or came from an older detector. */
export function getCachedPatchPoints(studioId: number, version: number): PatchPoint[] | null {
  const row = getRow(studioId)
  if (!row?.points_json || row.points_version !== version) return null
  try {
    const parsed = JSON.parse(row.points_json) as unknown
    return Array.isArray(parsed) ? (parsed as PatchPoint[]) : null
  } catch {
    return null
  }
}

export function setCachedPatchPoints(studioId: number, points: PatchPoint[], version: number): void {
  getDb()
    .prepare('UPDATE patchbay_files SET points_json = ?, points_version = ? WHERE studio_id = ?')
    .run(JSON.stringify(points), version, studioId)
}

/** Insert or replace a studio's patchbay. Clears the cached jacks so they're detected afresh. */
export function upsertPatchbayFile(input: {
  studioId: number
  filePath: string
  originalName: string | null
  pageWidthPt: number
  pageHeightPt: number
}): PatchbayFile {
  getDb()
    .prepare(
      `INSERT INTO patchbay_files (studio_id, file_path, original_name, page_width_pt, page_height_pt)
       VALUES (@studioId, @filePath, @originalName, @pageWidthPt, @pageHeightPt)
       ON CONFLICT(studio_id) DO UPDATE SET
         file_path = excluded.file_path,
         original_name = excluded.original_name,
         page_width_pt = excluded.page_width_pt,
         page_height_pt = excluded.page_height_pt,
         points_json = NULL,
         points_version = NULL,
         imported_at = datetime('now')`
    )
    .run(input)
  return getPatchbayFileForStudio(input.studioId) as PatchbayFile
}

/** Removes a studio's patchbay: its row, then its copy in the patchbays folder. Cables drawn on it
 *  belong to setups and are left alone, so uploading a drawing again brings them back. */
export function deletePatchbayFile(studioId: number): void {
  const row = getRow(studioId)
  if (!row) return
  getDb().prepare('DELETE FROM patchbay_files WHERE studio_id = ?').run(studioId)
  try {
    rmSync(row.file_path, { force: true })
  } catch {
    // non-critical: an orphaned file in the patchbays folder
  }
}
