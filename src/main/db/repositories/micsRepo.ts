import type { Mic, MicPoolType, MicWithStudio } from '@shared/types/entities'
import type { MicUpsertInput } from '@shared/types/ipc'
import { getDb } from '../index'
import { getStudio } from './studiosRepo'
import { getSetting } from './settingsRepo'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'

interface MicRow {
  id: number
  pool_type: MicPoolType
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

function mapRow(row: MicRow): Mic {
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

export function listStudioMics(studioId: number): Mic[] {
  const rows = getDb()
    .prepare("SELECT * FROM mics WHERE pool_type = 'studio' AND studio_id = ? ORDER BY sort_order, name")
    .all(studioId) as MicRow[]
  return rows.map(mapRow)
}

export function listBuildingPool(buildingId: number): Mic[] {
  const rows = getDb()
    .prepare("SELECT * FROM mics WHERE pool_type = 'building' AND building_id = ? ORDER BY sort_order, name")
    .all(buildingId) as MicRow[]
  return rows.map(mapRow)
}

export function listFacultyReserve(): Mic[] {
  const rows = getDb()
    .prepare("SELECT * FROM mics WHERE pool_type = 'faculty_reserve' ORDER BY sort_order, name")
    .all() as MicRow[]
  return rows.map(mapRow)
}

/** The user's own global "Personal Gear Locker" — always visible, unlike faculty reserve. */
export function listPersonalPool(): Mic[] {
  const rows = getDb()
    .prepare("SELECT * FROM mics WHERE pool_type = 'personal' ORDER BY sort_order, name")
    .all() as MicRow[]
  return rows.map(mapRow)
}

/** Gear scoped to one specific setup/session (e.g. borrowed gear) — never visible in any other setup. */
export function listSetupGear(setupId: number): Mic[] {
  const rows = getDb()
    .prepare("SELECT * FROM mics WHERE pool_type = 'setup' AND setup_id = ? ORDER BY sort_order, name")
    .all(setupId) as MicRow[]
  return rows.map(mapRow)
}

/**
 * Union of a studio's own locker, its building's shared pool, the user's personal gear
 * locker (always included), the current setup's own borrowed-gear locker (if a setupId is
 * given), and (only if enabled in app settings) the global faculty reserve — students
 * can't access the reserve, so it must stay opt-in rather than on by default. Even with the
 * global setting on, the reserve is Berklee-only by default (studio.buildingId != null);
 * a custom (buildingless) studio only sees it if it's individually opted in via
 * studio.facultyReserveEnabled.
 */
export function listAvailableForStudio(studioId: number, setupId?: number | null): Mic[] {
  const studio = getStudio(studioId)
  if (!studio) return []

  const facultyReserveEnabled = getSetting(APP_SETTINGS_KEYS.facultyReserveEnabled) === '1'

  // Custom (buildingless) studios have no building-wide shared pool to union in.
  const mics = [
    ...listStudioMics(studioId),
    ...(studio.buildingId != null ? listBuildingPool(studio.buildingId) : []),
    ...listPersonalPool(),
    ...(setupId != null ? listSetupGear(setupId) : [])
  ]
  if (facultyReserveEnabled && (studio.buildingId != null || studio.facultyReserveEnabled)) {
    mics.push(...listFacultyReserve())
  }
  return mics
}

export function upsertMic(input: MicUpsertInput): Mic {
  const db = getDb()
  if (input.id) {
    db.prepare(
      'UPDATE mics SET pool_type = ?, studio_id = ?, building_id = ?, setup_id = ?, name = ?, manufacturer = ?, category = ?, notes = ?, quantity = ?, sort_order = ? WHERE id = ?'
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
    const row = db.prepare('SELECT * FROM mics WHERE id = ?').get(input.id) as MicRow
    return mapRow(row)
  }

  const info = db
    .prepare(
      'INSERT INTO mics (pool_type, studio_id, building_id, setup_id, name, manufacturer, category, notes, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
  const row = db.prepare('SELECT * FROM mics WHERE id = ?').get(info.lastInsertRowid) as MicRow
  return mapRow(row)
}

export function removeMic(id: number): void {
  getDb().prepare('DELETE FROM mics WHERE id = ?').run(id)
}

export function getMicById(id: number): Mic | null {
  const row = getDb().prepare('SELECT * FROM mics WHERE id = ?').get(id) as MicRow | undefined
  return row ? mapRow(row) : null
}

/** Every mic in the entire database regardless of pool (studio lockers, building pools,
 *  faculty reserve, personal, setup-scoped) — powers the comprehensive "Add from Catalogue"
 *  picker when building a new studio's inventory, where origin doesn't matter. */
export function listAllMics(): Mic[] {
  const rows = getDb().prepare('SELECT * FROM mics ORDER BY name').all() as MicRow[]
  return rows.map(mapRow)
}

/** Every studio-locker mic across every studio, tagged with its studio's name — powers the
 *  "copy gear from other studios" picker when setting up a new studio's inventory. */
export function listAllMicsWithStudio(): MicWithStudio[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, s.name as studio_name FROM mics m
       JOIN studios s ON s.id = m.studio_id
       WHERE m.pool_type = 'studio'
       ORDER BY s.name, m.sort_order, m.name`
    )
    .all() as (MicRow & { studio_name: string })[]
  return rows.map((row) => ({ ...mapRow(row), studioName: row.studio_name }))
}
