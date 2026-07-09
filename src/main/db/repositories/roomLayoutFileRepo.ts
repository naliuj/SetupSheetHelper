import type { RoomLayoutFile } from '@shared/types/entities'
import { getDb } from '../index'

interface RoomLayoutFileRow {
  id: number
  studio_id: number
  file_path: string
  original_name: string | null
  page_width_pt: number | null
  page_height_pt: number | null
  imported_at: string
}

function mapRow(row: RoomLayoutFileRow): RoomLayoutFile {
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

export function getLayoutFileForStudio(studioId: number): RoomLayoutFile | null {
  const row = getDb()
    .prepare('SELECT * FROM room_layout_files WHERE studio_id = ?')
    .get(studioId) as RoomLayoutFileRow | undefined
  return row ? mapRow(row) : null
}

export function upsertLayoutFile(input: {
  studioId: number
  filePath: string
  originalName: string | null
  pageWidthPt: number | null
  pageHeightPt: number | null
}): RoomLayoutFile {
  const db = getDb()
  db.prepare(
    `INSERT INTO room_layout_files (studio_id, file_path, original_name, page_width_pt, page_height_pt)
     VALUES (@studioId, @filePath, @originalName, @pageWidthPt, @pageHeightPt)
     ON CONFLICT(studio_id) DO UPDATE SET
       file_path = excluded.file_path,
       original_name = excluded.original_name,
       page_width_pt = excluded.page_width_pt,
       page_height_pt = excluded.page_height_pt,
       imported_at = datetime('now')`
  ).run(input)
  return getLayoutFileForStudio(input.studioId) as RoomLayoutFile
}
