import type { PatchbayCable, PatchbayCableDraft, SavePatchbayCablesResult } from '@shared/types/patchbay'
import { getDb } from '../index'

interface PatchbayCableRow {
  id: number
  setup_id: number
  from_x: number
  from_y: number
  to_x: number
  to_y: number
  from_point: string | null
  to_point: string | null
  color: string
  sag: number
  z_index: number
}

function mapRow(row: PatchbayCableRow): PatchbayCable {
  return {
    id: row.id,
    setupId: row.setup_id,
    fromX: row.from_x,
    fromY: row.from_y,
    toX: row.to_x,
    toY: row.to_y,
    fromPoint: row.from_point,
    toPoint: row.to_point,
    color: row.color,
    sag: row.sag,
    zIndex: row.z_index
  }
}

const COLUMNS = 'setup_id, from_x, from_y, to_x, to_y, from_point, to_point, color, sag, z_index'
const VALUES = '@setupId, @fromX, @fromY, @toX, @toY, @fromPoint, @toPoint, @color, @sag, @zIndex'

function params(setupId: number, cable: Omit<PatchbayCableDraft, 'id'>): Record<string, unknown> {
  return {
    setupId,
    fromX: cable.fromX,
    fromY: cable.fromY,
    toX: cable.toX,
    toY: cable.toY,
    // ?? null: better-sqlite3 rejects a missing named parameter rather than binding NULL.
    fromPoint: cable.fromPoint ?? null,
    toPoint: cable.toPoint ?? null,
    color: cable.color,
    sag: Math.min(1, Math.max(0, cable.sag)),
    zIndex: cable.zIndex
  }
}

export function listCablesBySetup(setupId: number): PatchbayCable[] {
  const rows = getDb()
    .prepare('SELECT * FROM patchbay_cables WHERE setup_id = ? ORDER BY z_index, id')
    .all(setupId) as PatchbayCableRow[]
  return rows.map(mapRow)
}

/** Copies every cable from one setup to another — used when a setup is duplicated. */
export function copyCablesToSetup(sourceSetupId: number, targetSetupId: number): void {
  const db = getDb()
  const insert = db.prepare(`INSERT INTO patchbay_cables (${COLUMNS}) VALUES (${VALUES})`)
  const cables = listCablesBySetup(sourceSetupId)
  db.transaction(() => {
    for (const cable of cables) insert.run(params(targetSetupId, cable))
  })()
}

/** Saves a setup's whole cable list in one transaction, with roomLayoutBlocksRepo's id-preserving
 *  pattern: numeric ids that still exist UPDATE in place, everything else INSERTs (reported in
 *  idMap so the renderer can swap its draft ids), and rows missing from the list are DELETEd. */
export function replaceCablesForSetup(setupId: number, cables: PatchbayCableDraft[]): SavePatchbayCablesResult {
  const db = getDb()
  const idMap: Record<string, number> = {}
  const insert = db.prepare(`INSERT INTO patchbay_cables (${COLUMNS}) VALUES (${VALUES})`)
  const update = db.prepare(
    `UPDATE patchbay_cables SET
       from_x = @fromX, from_y = @fromY, to_x = @toX, to_y = @toY, from_point = @fromPoint,
       to_point = @toPoint, color = @color, sag = @sag, z_index = @zIndex, updated_at = datetime('now')
     WHERE id = @id AND setup_id = @setupId`
  )
  const remove = db.prepare('DELETE FROM patchbay_cables WHERE id = ?')

  db.transaction(() => {
    const existing = new Set(
      (db.prepare('SELECT id FROM patchbay_cables WHERE setup_id = ?').all(setupId) as { id: number }[]).map(
        (r) => r.id
      )
    )
    const keep = new Set<number>()
    for (const cable of cables) {
      if (typeof cable.id === 'number' && existing.has(cable.id)) {
        update.run({ ...params(setupId, cable), id: cable.id })
        keep.add(cable.id)
      } else {
        const newId = Number(insert.run(params(setupId, cable)).lastInsertRowid)
        keep.add(newId)
        // Every insert, including a numeric id whose row is gone (a cable restored by Undo after
        // its deletion was saved), so the renderer never keeps a dangling id.
        idMap[String(cable.id)] = newId
      }
    }
    for (const id of existing) if (!keep.has(id)) remove.run(id)
  })()

  return { cables: listCablesBySetup(setupId), idMap }
}
