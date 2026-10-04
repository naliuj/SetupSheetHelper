import type { SetupLayoutOverride } from '@shared/types/entities'
import { getDb } from '../index'

interface SetupLayoutOverrideRow {
  id: number
  setup_id: number
  kind: 'blank' | 'file'
  file_path: string | null
  original_name: string | null
  page_width_pt: number | null
  page_height_pt: number | null
  imported_at: string
  legacy_pixel_units: number
}

function mapRow(row: SetupLayoutOverrideRow): SetupLayoutOverride {
  return {
    id: row.id,
    setupId: row.setup_id,
    kind: row.kind,
    filePath: row.file_path,
    originalName: row.original_name,
    pageWidthPt: row.page_width_pt,
    pageHeightPt: row.page_height_pt,
    importedAt: row.imported_at,
    legacyPixelUnits: row.legacy_pixel_units === 1
  }
}

export function getSetupLayoutOverride(setupId: number): SetupLayoutOverride | null {
  const row = getDb()
    .prepare('SELECT * FROM setup_layout_overrides WHERE setup_id = ?')
    .get(setupId) as SetupLayoutOverrideRow | undefined
  return row ? mapRow(row) : null
}

export function upsertBlankLayoutOverride(setupId: number): SetupLayoutOverride {
  getDb()
    .prepare(
      `INSERT INTO setup_layout_overrides (setup_id, kind)
       VALUES (@setupId, 'blank')
       ON CONFLICT(setup_id) DO UPDATE SET
         kind = 'blank',
         file_path = NULL,
         original_name = NULL,
         page_width_pt = NULL,
         page_height_pt = NULL,
         imported_at = datetime('now'),
         legacy_pixel_units = 0`
    )
    .run({ setupId })
  return getSetupLayoutOverride(setupId) as SetupLayoutOverride
}

export function upsertFileLayoutOverride(input: {
  setupId: number
  filePath: string
  originalName: string | null
  pageWidthPt: number | null
  pageHeightPt: number | null
}): SetupLayoutOverride {
  getDb()
    .prepare(
      `INSERT INTO setup_layout_overrides (setup_id, kind, file_path, original_name, page_width_pt, page_height_pt)
       VALUES (@setupId, 'file', @filePath, @originalName, @pageWidthPt, @pageHeightPt)
       ON CONFLICT(setup_id) DO UPDATE SET
         kind = 'file',
         file_path = excluded.file_path,
         original_name = excluded.original_name,
         page_width_pt = excluded.page_width_pt,
         page_height_pt = excluded.page_height_pt,
         imported_at = datetime('now'),
         legacy_pixel_units = 0`
    )
    .run(input)
  return getSetupLayoutOverride(input.setupId) as SetupLayoutOverride
}

/** Drops a setup's own layout, so it falls back to the studio's (or to none). */
export function deleteSetupLayoutOverride(setupId: number): void {
  getDb().prepare('DELETE FROM setup_layout_overrides WHERE setup_id = ?').run(setupId)
}

/** How many layout rows (any setup's override or any studio's file) still name this file. A
 *  duplicated setup normally gets its own copy, but keeps the original's path when that copy
 *  failed, so a file is only safe to delete once nothing points at it. */
export function countLayoutFileReferences(filePath: string): number {
  const db = getDb()
  const setups = db.prepare('SELECT COUNT(*) AS n FROM setup_layout_overrides WHERE file_path = ?').get(filePath) as {
    n: number
  }
  const studios = db.prepare('SELECT COUNT(*) AS n FROM room_layout_files WHERE file_path = ?').get(filePath) as {
    n: number
  }
  return setups.n + studios.n
}
