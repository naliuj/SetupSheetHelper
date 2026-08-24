import type { Preamp, PreampPoolType } from '@shared/types/entities'
import type { PreampUpsertInput } from '@shared/types/ipc'
import { getDb } from '../index'
import { getStudio } from './studiosRepo'

interface PreampRow {
  id: number
  pool_type: PreampPoolType
  studio_id: number | null
  building_id: number | null
  setup_id: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  channels: number
  sort_order: number
}

function mapRow(row: PreampRow): Preamp {
  return {
    id: row.id,
    poolType: row.pool_type,
    studioId: row.studio_id,
    buildingId: row.building_id,
    setupId: row.setup_id,
    name: row.name,
    manufacturer: row.manufacturer,
    category: row.category,
    notes: row.notes,
    channels: row.channels,
    sortOrder: row.sort_order
  }
}

export function listPreampsByStudio(studioId: number): Preamp[] {
  const rows = getDb()
    .prepare("SELECT * FROM preamps WHERE pool_type = 'studio' AND studio_id = ? ORDER BY sort_order, name")
    .all(studioId) as PreampRow[]
  return rows.map(mapRow)
}

export function listBuildingPreamps(buildingId: number): Preamp[] {
  const rows = getDb()
    .prepare("SELECT * FROM preamps WHERE pool_type = 'building' AND building_id = ? ORDER BY sort_order, name")
    .all(buildingId) as PreampRow[]
  return rows.map(mapRow)
}

export function listFacultyReservePreamps(): Preamp[] {
  const rows = getDb()
    .prepare("SELECT * FROM preamps WHERE pool_type = 'faculty_reserve' ORDER BY sort_order, name")
    .all() as PreampRow[]
  return rows.map(mapRow)
}

/** The user's own global "Personal Gear Locker" — always visible, mirrors mics/outboard's personal pool. */
export function listPersonalPreamps(): Preamp[] {
  const rows = getDb()
    .prepare("SELECT * FROM preamps WHERE pool_type = 'personal' ORDER BY sort_order, name")
    .all() as PreampRow[]
  return rows.map(mapRow)
}

/** Preamps scoped to one specific setup/session (e.g. a borrowed unit) — never visible in any other setup. */
export function listSetupGear(setupId: number): Preamp[] {
  const rows = getDb()
    .prepare("SELECT * FROM preamps WHERE pool_type = 'setup' AND setup_id = ? ORDER BY sort_order, name")
    .all(setupId) as PreampRow[]
  return rows.map(mapRow)
}

/** Union of a studio's own preamp locker, its building's shared pool, the user's personal gear
 *  locker (always included), the current setup's own borrowed-gear locker (if a setupId is
 *  given), and the global faculty reserve if this setup has opted in — mirrors
 *  outboardRepo.listAvailableForStudio exactly, now that preamps share the same 5-pool system. */
export function listAvailableForStudio(
  studioId: number,
  setupId?: number | null,
  facultyReserveEnabledForSetup?: boolean
): Preamp[] {
  const studio = getStudio(studioId)
  if (!studio) return []

  const preamps = [
    ...listPreampsByStudio(studioId),
    ...(studio.buildingId != null ? listBuildingPreamps(studio.buildingId) : []),
    ...listPersonalPreamps(),
    ...(setupId != null ? listSetupGear(setupId) : [])
  ]
  if (facultyReserveEnabledForSetup) {
    preamps.push(...listFacultyReservePreamps())
  }
  return preamps
}

export function getPreampById(id: number): Preamp | null {
  const row = getDb().prepare('SELECT * FROM preamps WHERE id = ?').get(id) as PreampRow | undefined
  return row ? mapRow(row) : null
}

/** Batch id lookup in one query — for per-row resolution loops (e.g. PDF export), where calling
 *  getPreampById per row would issue one query per item. */
export function getPreampsByIds(ids: number[]): Map<number, Preamp> {
  const map = new Map<number, Preamp>()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb().prepare(`SELECT * FROM preamps WHERE id IN (${placeholders})`).all(...ids) as PreampRow[]
  for (const row of rows) map.set(row.id, mapRow(row))
  return map
}

export function upsertPreamp(input: PreampUpsertInput): Preamp {
  const db = getDb()
  if (input.id) {
    db.prepare(
      'UPDATE preamps SET pool_type = ?, studio_id = ?, building_id = ?, setup_id = ?, name = ?, manufacturer = ?, category = ?, notes = ?, channels = ?, sort_order = ? WHERE id = ?'
    ).run(
      input.poolType,
      input.studioId,
      input.buildingId,
      input.setupId,
      input.name,
      input.manufacturer,
      input.category,
      input.notes,
      input.channels ?? 1,
      input.sortOrder ?? 0,
      input.id
    )
    const row = db.prepare('SELECT * FROM preamps WHERE id = ?').get(input.id) as PreampRow
    return mapRow(row)
  }

  const info = db
    .prepare(
      'INSERT INTO preamps (pool_type, studio_id, building_id, setup_id, name, manufacturer, category, notes, channels, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.poolType,
      input.studioId,
      input.buildingId,
      input.setupId,
      input.name,
      input.manufacturer,
      input.category,
      input.notes,
      input.channels ?? 1,
      input.sortOrder ?? 0
    )
  const row = db.prepare('SELECT * FROM preamps WHERE id = ?').get(info.lastInsertRowid) as PreampRow
  return mapRow(row)
}

/** Preserves the preamp's name as free text on any setup row that used it before deleting, so the
 *  row shows "Unresolved: <name>" rather than silently emptying — see removeMic in micsRepo.ts for
 *  the full rationale. */
export function removePreamp(id: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `UPDATE setup_items
          SET preamp_text = (SELECT name FROM preamps WHERE id = ?)
        WHERE preamp_id = ? AND preamp_text IS NULL`
    ).run(id, id)
    db.prepare('DELETE FROM preamps WHERE id = ?').run(id)
  })()
}

/** Every preamp in the entire database regardless of pool — powers manufacturer/model
 *  suggestion lookups the same way listAllMics/listAllOutboard do. */
export function listAllPreamps(): Preamp[] {
  const rows = getDb().prepare('SELECT * FROM preamps ORDER BY name').all() as PreampRow[]
  return rows.map(mapRow)
}
