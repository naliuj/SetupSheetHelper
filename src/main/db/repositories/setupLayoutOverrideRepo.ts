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
    importedAt: row.imported_at
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
         imported_at = datetime('now')`
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
         imported_at = datetime('now')`
    )
    .run(input)
  return getSetupLayoutOverride(input.setupId) as SetupLayoutOverride
}
