import type { Preamp, PreampPoolType } from '@shared/types/entities'
import type { PreampUpsertInput } from '@shared/types/ipc'
import { getDb } from '../index'

interface PreampRow {
  id: number
  pool_type: PreampPoolType
  studio_id: number | null
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

/** Preamps scoped to one specific setup/session (e.g. a borrowed unit) — never visible in any other setup. */
export function listSetupGear(setupId: number): Preamp[] {
  const rows = getDb()
    .prepare("SELECT * FROM preamps WHERE pool_type = 'setup' AND setup_id = ? ORDER BY sort_order, name")
    .all(setupId) as PreampRow[]
  return rows.map(mapRow)
}

/** Union of a studio's own preamp locker and the current setup's own borrowed-gear locker (if
 *  a setupId is given). No building/personal/faculty-reserve pools for preamps — a much
 *  narrower version of micsRepo/outboardRepo's listAvailableForStudio. */
export function listAvailableForStudio(studioId: number, setupId?: number | null): Preamp[] {
  return [...listPreampsByStudio(studioId), ...(setupId != null ? listSetupGear(setupId) : [])]
}

export function getPreampById(id: number): Preamp | null {
  const row = getDb().prepare('SELECT * FROM preamps WHERE id = ?').get(id) as PreampRow | undefined
  return row ? mapRow(row) : null
}

export function upsertPreamp(input: PreampUpsertInput): Preamp {
  const db = getDb()
  if (input.id) {
    db.prepare(
      'UPDATE preamps SET pool_type = ?, studio_id = ?, setup_id = ?, name = ?, manufacturer = ?, category = ?, notes = ?, channels = ?, sort_order = ? WHERE id = ?'
    ).run(
      input.poolType,
      input.studioId,
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
      'INSERT INTO preamps (pool_type, studio_id, setup_id, name, manufacturer, category, notes, channels, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.poolType,
      input.studioId,
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

export function removePreamp(id: number): void {
  getDb().prepare('DELETE FROM preamps WHERE id = ?').run(id)
}

/** Every preamp in the entire database regardless of pool — powers manufacturer/model
 *  suggestion lookups the same way listAllMics/listAllOutboard do. */
export function listAllPreamps(): Preamp[] {
  const rows = getDb().prepare('SELECT * FROM preamps ORDER BY name').all() as PreampRow[]
  return rows.map(mapRow)
}
