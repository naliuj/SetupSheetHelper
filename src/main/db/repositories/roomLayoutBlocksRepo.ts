import type { RoomLayoutBlock } from '@shared/types/setup'
import type { RoomLayoutBlockInput } from '@shared/types/ipc'
import { getDb } from '../index'

interface RoomLayoutBlockRow {
  id: number
  setup_id: number
  label: string
  shape: 'rect' | 'circle'
  color: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  z_index: number
}

function mapRow(row: RoomLayoutBlockRow): RoomLayoutBlock {
  return {
    id: row.id,
    setupId: row.setup_id,
    label: row.label,
    shape: row.shape,
    color: row.color,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    zIndex: row.z_index
  }
}

export function listBlocksBySetup(setupId: number): RoomLayoutBlock[] {
  const rows = getDb()
    .prepare('SELECT * FROM room_layout_blocks WHERE setup_id = ? ORDER BY z_index, id')
    .all(setupId) as RoomLayoutBlockRow[]
  return rows.map(mapRow)
}

/** Upserts all blocks for a setup in one transaction — same id-preserving pattern as
 *  setupItemsRepo.replaceItemsForSetup (existing numeric ids UPDATE in place so they survive
 *  autosave without remounting; client-generated string ids INSERT; anything missing from the
 *  incoming set is DELETEd). */
export function replaceBlocksForSetup(setupId: number, blocks: RoomLayoutBlockInput[]): RoomLayoutBlock[] {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO room_layout_blocks (setup_id, label, shape, color, x, y, width, height, rotation, z_index)
     VALUES (@setupId, @label, @shape, @color, @x, @y, @width, @height, @rotation, @zIndex)`
  )
  const update = db.prepare(
    `UPDATE room_layout_blocks SET
      label = @label, shape = @shape, color = @color, x = @x, y = @y, width = @width,
      height = @height, rotation = @rotation, z_index = @zIndex, updated_at = datetime('now')
     WHERE id = @id AND setup_id = @setupId`
  )
  const deleteStmt = db.prepare('DELETE FROM room_layout_blocks WHERE id = ?')

  const replace = db.transaction(() => {
    const existingIds = new Set(
      (db.prepare('SELECT id FROM room_layout_blocks WHERE setup_id = ?').all(setupId) as { id: number }[]).map(
        (r) => r.id
      )
    )
    const keepIds = new Set<number>()

    for (const block of blocks) {
      const params = {
        setupId,
        label: block.label,
        shape: block.shape,
        color: block.color,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        rotation: block.rotation,
        zIndex: block.zIndex
      }
      if (typeof block.id === 'number' && existingIds.has(block.id)) {
        update.run({ ...params, id: block.id })
        keepIds.add(block.id)
      } else {
        const info = insert.run(params)
        keepIds.add(Number(info.lastInsertRowid))
      }
    }

    for (const id of existingIds) {
      if (!keepIds.has(id)) deleteStmt.run(id)
    }
  })
  replace()

  return listBlocksBySetup(setupId)
}
