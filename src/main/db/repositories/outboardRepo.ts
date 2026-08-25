import type { OutboardGear, OutboardGearWithStudio, OutboardPoolType } from '@shared/types/entities'
import type { OutboardUpsertInput } from '@shared/types/ipc'
import { getDb } from '../index'
import { getStudio } from './studiosRepo'

interface OutboardRow {
  id: number
  pool_type: OutboardPoolType
  studio_id: number | null
  building_id: number | null
  setup_id: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  quantity: number
  sort_order: number
}

function mapRow(row: OutboardRow): OutboardGear {
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
    quantity: row.quantity,
    sortOrder: row.sort_order
  }
}

export function listOutboardByStudio(studioId: number): OutboardGear[] {
  const rows = getDb()
    .prepare("SELECT * FROM outboard_gear WHERE pool_type = 'studio' AND studio_id = ? ORDER BY sort_order, name")
    .all(studioId) as OutboardRow[]
  return rows.map(mapRow)
}

export function listBuildingPool(buildingId: number): OutboardGear[] {
  const rows = getDb()
    .prepare("SELECT * FROM outboard_gear WHERE pool_type = 'building' AND building_id = ? ORDER BY sort_order, name")
    .all(buildingId) as OutboardRow[]
  return rows.map(mapRow)
}

export function listFacultyReserve(): OutboardGear[] {
  const rows = getDb()
    .prepare("SELECT * FROM outboard_gear WHERE pool_type = 'faculty_reserve' ORDER BY sort_order, name")
    .all() as OutboardRow[]
  return rows.map(mapRow)
}

/** The user's own global "Personal Gear Locker" — always visible, mirrors mics' personal pool. */
export function listPersonalOutboard(): OutboardGear[] {
  const rows = getDb()
    .prepare("SELECT * FROM outboard_gear WHERE pool_type = 'personal' ORDER BY sort_order, name")
    .all() as OutboardRow[]
  return rows.map(mapRow)
}

/** Gear scoped to one specific setup/session (e.g. borrowed gear) — never visible in any other setup. */
export function listSetupGear(setupId: number): OutboardGear[] {
  const rows = getDb()
    .prepare("SELECT * FROM outboard_gear WHERE pool_type = 'setup' AND setup_id = ? ORDER BY sort_order, name")
    .all(setupId) as OutboardRow[]
  return rows.map(mapRow)
}

/** Union of a studio's own outboard gear, its building's shared pool, the user's personal gear
 *  locker (always included), the current setup's own borrowed-gear locker (if a setupId is
 *  given), and the global faculty reserve if this setup has opted in — mirrors
 *  micsRepo.listAvailableForStudio exactly. */
export function listAvailableForStudio(
  studioId: number,
  setupId?: number | null,
  facultyReserveEnabledForSetup?: boolean
): OutboardGear[] {
  const studio = getStudio(studioId)
  if (!studio) return []

  const gear = [
    ...listOutboardByStudio(studioId),
    ...(studio.buildingId != null ? listBuildingPool(studio.buildingId) : []),
    ...listPersonalOutboard(),
    ...(setupId != null ? listSetupGear(setupId) : [])
  ]
  if (facultyReserveEnabledForSetup) {
    gear.push(...listFacultyReserve())
  }
  return gear
}

export function getOutboardById(id: number): OutboardGear | null {
  const row = getDb().prepare('SELECT * FROM outboard_gear WHERE id = ?').get(id) as OutboardRow | undefined
  return row ? mapRow(row) : null
}

/** Batch id lookup in one query — for per-row resolution loops (e.g. PDF export), where calling
 *  getOutboardById per slot would issue one query per outboard cell. */
export function getOutboardByIds(ids: number[]): Map<number, OutboardGear> {
  const map = new Map<number, OutboardGear>()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb().prepare(`SELECT * FROM outboard_gear WHERE id IN (${placeholders})`).all(...ids) as OutboardRow[]
  for (const row of rows) map.set(row.id, mapRow(row))
  return map
}

export function upsertOutboard(input: OutboardUpsertInput): OutboardGear {
  const db = getDb()
  if (input.id) {
    db.prepare(
      'UPDATE outboard_gear SET pool_type = ?, studio_id = ?, building_id = ?, setup_id = ?, name = ?, manufacturer = ?, category = ?, notes = ?, quantity = ?, sort_order = ? WHERE id = ?'
    ).run(
      input.poolType,
      input.studioId,
      input.buildingId,
      input.setupId,
      input.name,
      input.manufacturer,
      input.category,
      input.notes,
      input.quantity ?? 1,
      input.sortOrder ?? 0,
      input.id
    )
    const row = db.prepare('SELECT * FROM outboard_gear WHERE id = ?').get(input.id) as OutboardRow
    return mapRow(row)
  }

  const info = db
    .prepare(
      'INSERT INTO outboard_gear (pool_type, studio_id, building_id, setup_id, name, manufacturer, category, notes, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      input.quantity ?? 1,
      input.sortOrder ?? 0
    )
  const row = db.prepare('SELECT * FROM outboard_gear WHERE id = ?').get(info.lastInsertRowid) as OutboardRow
  return mapRow(row)
}

/** Preserves the gear's name as free text on any setup slot that used it before deleting, so the
 *  slot keeps showing the name rather than silently emptying — see removeMic in micsRepo.ts for
 *  the full rationale, including why it carries no deleted-from-inventory warning. */
export function removeOutboard(id: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `UPDATE setup_item_outboards
          SET outboard_text = (SELECT name FROM outboard_gear WHERE id = ?)
        WHERE outboard_id = ? AND outboard_text IS NULL`
    ).run(id, id)
    db.prepare('DELETE FROM outboard_gear WHERE id = ?').run(id)
  })()
}

/** Every outboard item in the entire database regardless of pool — powers the comprehensive
 *  "Add from Catalogue" picker when building a new studio's inventory, mirrors listAllMics. */
export function listAllOutboard(): OutboardGear[] {
  const rows = getDb().prepare('SELECT * FROM outboard_gear ORDER BY name').all() as OutboardRow[]
  return rows.map(mapRow)
}

/** Every studio-owned outboard item across every studio, tagged with its studio's name — powers the
 *  "copy gear from other studios" picker when setting up a new studio's inventory. Excludes the
 *  personal gear locker, which is a separate concept from "copy from another studio." */
export function listAllOutboardWithStudio(): OutboardGearWithStudio[] {
  const rows = getDb()
    .prepare(
      `SELECT o.*, s.name as studio_name FROM outboard_gear o
       JOIN studios s ON s.id = o.studio_id
       WHERE o.pool_type = 'studio'
       ORDER BY s.name, o.sort_order, o.name`
    )
    .all() as (OutboardRow & { studio_name: string })[]
  return rows.map((row) => ({ ...mapRow(row), studioName: row.studio_name }))
}
