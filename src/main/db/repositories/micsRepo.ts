import type { Mic, MicPoolType, MicWithStudio } from '@shared/types/entities'
import type { MicUpsertInput } from '@shared/types/ipc'
import { getDb } from '../index'
import { getStudio } from './studiosRepo'

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
 * given), and the global faculty reserve if this setup has opted in — students can't access
 * the reserve, so it must stay opt-in rather than on by default. facultyReserveEnabledForSetup
 * is passed in live from the caller's current setupStore state, not looked up by setupId, so
 * toggling the setup's checkbox reflects here immediately without needing a save first — there
 * is no automatic grant for real Berklee studios; every setup opts in individually.
 */
export function listAvailableForStudio(
  studioId: number,
  setupId?: number | null,
  facultyReserveEnabledForSetup?: boolean
): Mic[] {
  const studio = getStudio(studioId)
  if (!studio) return []

  // Custom (buildingless) studios have no building-wide shared pool to union in.
  const mics = [
    ...listStudioMics(studioId),
    ...(studio.buildingId != null ? listBuildingPool(studio.buildingId) : []),
    ...listPersonalPool(),
    ...(setupId != null ? listSetupGear(setupId) : [])
  ]
  if (facultyReserveEnabledForSetup) {
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

/** Deleting a mic nulls out `setup_items.mic_id` via the FK's ON DELETE SET NULL, which on its own
 *  would leave every row that used it silently blank — the engineer loses the record of what was
 *  actually on that source, with nothing on screen saying so. So first copy the mic's name into
 *  each affected row's `mic_text`, the same free-text fallback the setup importer uses when it
 *  can't match a mic in the target studio (see setups/exportImport.ts); the row then renders the
 *  existing "Unresolved: <name>" badge instead of going empty. Only fills rows whose `mic_text` is
 *  still null, so a genuine prior free-text value is never overwritten. */
export function removeMic(id: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `UPDATE setup_items
          SET mic_text = (SELECT name FROM mics WHERE id = ?)
        WHERE mic_id = ? AND mic_text IS NULL`
    ).run(id, id)
    db.prepare('DELETE FROM mics WHERE id = ?').run(id)
  })()
}

export function getMicById(id: number): Mic | null {
  const row = getDb().prepare('SELECT * FROM mics WHERE id = ?').get(id) as MicRow | undefined
  return row ? mapRow(row) : null
}

/** Batch id lookup in one query — for per-row resolution loops (e.g. PDF export), where calling
 *  getMicById per row would issue one query per item. */
export function getMicsByIds(ids: number[]): Map<number, Mic> {
  const map = new Map<number, Mic>()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb().prepare(`SELECT * FROM mics WHERE id IN (${placeholders})`).all(...ids) as MicRow[]
  for (const row of rows) map.set(row.id, mapRow(row))
  return map
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
