import type { Studio } from '@shared/types/entities'
import { getDb } from '../index'
import { removeSetup } from './setupsRepo'

interface StudioRow {
  id: number
  building_id: number | null
  folder_id: number | null
  name: string
  is_temporary: number
  sort_order: number
  created_at: string
}

function mapRow(row: StudioRow): Studio {
  return {
    id: row.id,
    buildingId: row.building_id,
    folderId: row.folder_id,
    name: row.name,
    isTemporary: row.is_temporary === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  }
}

export function listStudiosByBuilding(buildingId: number): Studio[] {
  const rows = getDb()
    .prepare('SELECT * FROM studios WHERE building_id = ? ORDER BY name')
    .all(buildingId) as StudioRow[]
  return rows.map(mapRow)
}

/** Custom (buildingless) studios, e.g. for the home screen's Studio Templates section. Excludes Quick Setup throwaways. */
export function listCustomStudios(): Studio[] {
  const rows = getDb()
    .prepare('SELECT * FROM studios WHERE building_id IS NULL AND is_temporary = 0 ORDER BY sort_order, name')
    .all() as StudioRow[]
  return rows.map(mapRow)
}

export function getStudio(id: number): Studio | null {
  const row = getDb().prepare('SELECT * FROM studios WHERE id = ?').get(id) as StudioRow | undefined
  return row ? mapRow(row) : null
}

export function createStudio(buildingId: number, name: string): Studio {
  const info = getDb()
    .prepare('INSERT INTO studios (building_id, name) VALUES (?, ?)')
    .run(buildingId, name)
  const row = getDb().prepare('SELECT * FROM studios WHERE id = ?').get(info.lastInsertRowid) as StudioRow
  return mapRow(row)
}

/** Creates a custom studio with no building — organized (optionally) by folder instead. */
export function createCustomStudio(name: string, folderId: number | null = null): Studio {
  const info = getDb()
    .prepare('INSERT INTO studios (building_id, folder_id, name) VALUES (NULL, ?, ?)')
    .run(folderId, name)
  const row = getDb().prepare('SELECT * FROM studios WHERE id = ?').get(info.lastInsertRowid) as StudioRow
  return mapRow(row)
}

/** Creates a throwaway, studio-less-locker studio for "Quick Setup" — invisible to every other listing. */
export function createTemporaryStudio(name = 'Quick Setup'): Studio {
  const info = getDb()
    .prepare('INSERT INTO studios (building_id, folder_id, name, is_temporary) VALUES (NULL, NULL, ?, 1)')
    .run(name)
  const row = getDb().prepare('SELECT * FROM studios WHERE id = ?').get(info.lastInsertRowid) as StudioRow
  return mapRow(row)
}

export function renameStudio(id: number, name: string): void {
  getDb().prepare('UPDATE studios SET name = ? WHERE id = ?').run(name, id)
}

/** Updates a custom studio's name and folder together — used by the full-window studio setup page. */
export function updateCustomStudio(id: number, name: string, folderId: number | null): Studio {
  const db = getDb()
  db.prepare('UPDATE studios SET name = ?, folder_id = ? WHERE id = ?').run(name, folderId, id)
  const row = db.prepare('SELECT * FROM studios WHERE id = ?').get(id) as StudioRow
  return mapRow(row)
}

export function removeStudio(id: number): void {
  getDb().prepare('DELETE FROM studios WHERE id = ?').run(id)
}

export interface StudioDeleteImpact {
  setupCount: number
  templateCount: number
}

/** Counts what deleting this studio would also delete, for the cascade-delete confirmation. */
export function getStudioDeleteImpact(id: number): StudioDeleteImpact {
  const db = getDb()
  const setupCount = (
    db.prepare(`SELECT COUNT(*) c FROM setups WHERE studio_id = ? AND kind = 'setup'`).get(id) as { c: number }
  ).c
  const templateCount = (
    db.prepare(`SELECT COUNT(*) c FROM setups WHERE studio_id = ? AND kind = 'template'`).get(id) as { c: number }
  ).c
  return { setupCount, templateCount }
}

/** Deletes a studio and everything under it (its setups/templates) as one transaction.
 *  Mics/outboard/room-layout-pdf rows already cascade via existing ON DELETE CASCADE FKs
 *  on studio_id, so only setups need explicit pre-deletion (their studio_id FK is RESTRICT). */
export function removeStudioCascade(id: number): void {
  const db = getDb()
  const run = db.transaction(() => {
    const setupIds = (
      db.prepare('SELECT id FROM setups WHERE studio_id = ?').all(id) as { id: number }[]
    ).map((r) => r.id)
    for (const setupId of setupIds) removeSetup(setupId)
    db.prepare('DELETE FROM studios WHERE id = ?').run(id)
  })
  run()
}

/** Lightweight reparent for drag-to-folder — unlike updateCustomStudio, doesn't touch name. */
export function moveStudioToFolder(id: number, folderId: number | null): void {
  getDb().prepare('UPDATE studios SET folder_id = ? WHERE id = ?').run(folderId, id)
}

/** Batch reorder within a folder — assigns sequential sort_order in the given id order. */
export function reorderStudios(ids: number[]): void {
  const db = getDb()
  const run = db.transaction(() => {
    const stmt = db.prepare('UPDATE studios SET sort_order = ? WHERE id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  run()
}
