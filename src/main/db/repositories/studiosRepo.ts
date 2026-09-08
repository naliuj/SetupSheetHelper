import type { Studio } from '@shared/types/entities'
import type { SaveStudioInventoryInput } from '@shared/types/ipc'
import { getDb } from '../index'
import { removeSetup } from './setupsRepo'
import { removeMic, upsertMic } from './micsRepo'
import { removeOutboard, upsertOutboard } from './outboardRepo'
import { removePreamp, upsertPreamp } from './preampRepo'

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

/** Bulk variant of removeStudioCascade — one outer transaction wrapping the per-id cascade (each
 *  removeStudioCascade opens its own transaction too, but better-sqlite3 nests these as savepoints). */
export function removeStudiosCascade(ids: number[]): void {
  const db = getDb()
  const run = db.transaction(() => {
    for (const id of ids) removeStudioCascade(id)
  })
  run()
}

/** Lightweight reparent for drag-to-folder — unlike updateCustomStudio, doesn't touch name. */
export function moveStudioToFolder(id: number, folderId: number | null): void {
  getDb().prepare('UPDATE studios SET folder_id = ? WHERE id = ?').run(folderId, id)
}

/** Bulk variant — dragging a multi-selection onto a folder in Manage Studios. Reparenting has no
 *  cascade concern (unlike delete), so this is a single statement rather than removeStudiosCascade's
 *  per-id transaction loop. */
export function moveStudiosToFolder(ids: number[], folderId: number | null): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  getDb()
    .prepare(`UPDATE studios SET folder_id = ? WHERE id IN (${placeholders})`)
    .run(folderId, ...ids)
}

/** Batch reorder within a folder — assigns sequential sort_order in the given id order. */
/** The studio editor's entire Save, in one transaction.
 *
 *  The editor used to drive this from the renderer as one IPC call per removal and per gear row,
 *  commonly fifty or more, each its own implicit transaction, with the deletions going first. A
 *  UNIQUE(studio_id, name) collision partway through committed the deletions and part of the
 *  upserts and dropped the rest, and the only visible symptom was the page not navigating home.
 *
 *  Array order becomes sort_order, which is also how the gear editors elsewhere should behave —
 *  see the audit note about new rows landing at sort_order 0. */
export function saveStudioInventory(input: SaveStudioInventoryInput): Studio {
  const db = getDb()
  const run = db.transaction(() => {
    const studio = input.studioId
      ? updateCustomStudio(input.studioId, input.name, input.folderId)
      : createCustomStudio(input.name, input.folderId)

    for (const id of input.removedMicIds) removeMic(id)
    for (const id of input.removedOutboardIds) removeOutboard(id)
    for (const id of input.removedPreampIds) removePreamp(id)

    // poolType/buildingId/setupId are fixed for a studio's own locker, so they are set here
    // rather than trusted from the renderer for every row.
    input.mics.forEach((item, index) => {
      upsertMic({
        id: item.existingId ?? undefined,
        poolType: 'studio',
        studioId: studio.id,
        buildingId: null,
        setupId: null,
        name: item.name,
        manufacturer: item.manufacturer,
        category: item.category,
        notes: null,
        quantity: item.quantity,
        sortOrder: index
      })
    })
    input.outboard.forEach((item, index) => {
      upsertOutboard({
        id: item.existingId ?? undefined,
        poolType: 'studio',
        studioId: studio.id,
        buildingId: null,
        setupId: null,
        name: item.name,
        manufacturer: item.manufacturer,
        category: item.category,
        notes: null,
        quantity: item.quantity,
        sortOrder: index
      })
    })
    input.preamps.forEach((item, index) => {
      upsertPreamp({
        id: item.existingId ?? undefined,
        poolType: 'studio',
        studioId: studio.id,
        buildingId: null,
        setupId: null,
        name: item.name,
        manufacturer: item.manufacturer,
        category: item.category,
        notes: null,
        channels: item.channels,
        sortOrder: index
      })
    })

    return studio
  })
  return run()
}

export function reorderStudios(ids: number[]): void {
  const db = getDb()
  const run = db.transaction(() => {
    const stmt = db.prepare('UPDATE studios SET sort_order = ? WHERE id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  run()
}
