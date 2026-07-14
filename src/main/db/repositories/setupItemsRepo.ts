import type { SetupItem, SetupItemOutboardSlot } from '@shared/types/setup'
import type { SetupItemInput } from '@shared/types/ipc'
import { getDb } from '../index'

interface SetupItemRow {
  id: number
  setup_id: number
  instrument_type: string
  source_name: string
  mic_id: number | null
  mic_text: string | null
  phantom_power: number
  channel: number | null
  tie_line: number | null
  cue_box: number | null
  preamp_id: number | null
  preamp_text: string | null
  polarity_flip: number
  notes: string | null
  color: string | null
  group_id: string | null
  sort_order: number
}

interface SetupItemOutboardRow {
  setup_item_id: number
  slot_index: number
  outboard_id: number | null
  outboard_text: string | null
}

function mapRow(row: SetupItemRow, outboards: SetupItemOutboardSlot[]): SetupItem {
  return {
    id: row.id,
    setupId: row.setup_id,
    instrumentType: row.instrument_type,
    sourceName: row.source_name,
    micId: row.mic_id,
    micText: row.mic_text,
    phantomPower: row.phantom_power === 1,
    channel: row.channel,
    tieLine: row.tie_line,
    cueBox: row.cue_box,
    outboards,
    preampId: row.preamp_id,
    preampText: row.preamp_text,
    polarityFlip: row.polarity_flip === 1,
    notes: row.notes,
    color: row.color,
    groupId: row.group_id
  }
}

/** Groups every outboard slot row for a set of setup_item ids, keyed by setup_item_id. */
function loadOutboardsByItemId(itemIds: number[]): Map<number, SetupItemOutboardSlot[]> {
  const map = new Map<number, SetupItemOutboardSlot[]>()
  if (itemIds.length === 0) return map
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT setup_item_id, slot_index, outboard_id, outboard_text FROM setup_item_outboards
       WHERE setup_item_id IN (${placeholders}) ORDER BY slot_index`
    )
    .all(...itemIds) as SetupItemOutboardRow[]
  for (const row of rows) {
    const slot: SetupItemOutboardSlot = {
      slotIndex: row.slot_index,
      outboardId: row.outboard_id,
      outboardText: row.outboard_text
    }
    const list = map.get(row.setup_item_id) ?? []
    list.push(slot)
    map.set(row.setup_item_id, list)
  }
  return map
}

export function listItemsBySetup(setupId: number): SetupItem[] {
  const rows = getDb()
    .prepare('SELECT * FROM setup_items WHERE setup_id = ? ORDER BY sort_order, id')
    .all(setupId) as SetupItemRow[]
  const outboardsByItemId = loadOutboardsByItemId(rows.map((r) => r.id))
  return rows.map((row) => mapRow(row, outboardsByItemId.get(row.id) ?? []))
}

/**
 * Upserts all items for a setup in one transaction. Existing items (numeric `id` already
 * in the DB) are UPDATEd in place rather than deleted+reinserted, so their id stays stable
 * across autosaves — the renderer table keys each row on `item.id`, and a delete+reinsert
 * here used to hand every row a fresh AUTOINCREMENT id on every single save, forcing a full
 * remount of every row (and dropping whatever input had focus) each time autosave fired.
 * New items (client-generated string id, never saved before) are INSERTed. Items no longer
 * present in the incoming set (removed client-side) are deleted.
 *
 * Each item's outboard slots are replaced wholesale (delete-then-reinsert) in the same
 * transaction — much simpler than diffing slot-by-slot, and slots have no independent
 * identity/history worth preserving across saves the way the item row's own id does.
 */
export function replaceItemsForSetup(setupId: number, items: SetupItemInput[]): SetupItem[] {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO setup_items
      (setup_id, instrument_type, source_name, mic_id, mic_text, phantom_power, channel, tie_line, cue_box, preamp_id, preamp_text, polarity_flip, notes, color, group_id, sort_order)
     VALUES (@setupId, @instrumentType, @sourceName, @micId, @micText, @phantomPower, @channel, @tieLine, @cueBox, @preampId, @preampText, @polarityFlip, @notes, @color, @groupId, @sortOrder)`
  )
  const update = db.prepare(
    `UPDATE setup_items SET
      instrument_type = @instrumentType, source_name = @sourceName, mic_id = @micId, mic_text = @micText,
      phantom_power = @phantomPower, channel = @channel, tie_line = @tieLine, cue_box = @cueBox,
      preamp_id = @preampId, preamp_text = @preampText,
      polarity_flip = @polarityFlip, notes = @notes, color = @color, group_id = @groupId, sort_order = @sortOrder,
      updated_at = datetime('now')
     WHERE id = @id AND setup_id = @setupId`
  )
  const deleteStmt = db.prepare('DELETE FROM setup_items WHERE id = ?')
  const deleteOutboards = db.prepare('DELETE FROM setup_item_outboards WHERE setup_item_id = ?')
  const insertOutboard = db.prepare(
    `INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id, outboard_text)
     VALUES (?, ?, ?, ?)`
  )

  function saveOutboards(itemId: number, outboards: SetupItemOutboardSlot[]): void {
    deleteOutboards.run(itemId)
    for (const slot of outboards) {
      if (slot.outboardId == null && !slot.outboardText) continue
      insertOutboard.run(itemId, slot.slotIndex, slot.outboardId, slot.outboardText)
    }
  }

  const replace = db.transaction(() => {
    const existingIds = new Set(
      (db.prepare('SELECT id FROM setup_items WHERE setup_id = ?').all(setupId) as { id: number }[]).map(
        (r) => r.id
      )
    )
    const keepIds = new Set<number>()

    items.forEach((item, index) => {
      const params = {
        setupId,
        instrumentType: item.instrumentType,
        sourceName: item.sourceName,
        micId: item.micId,
        micText: item.micText,
        phantomPower: item.phantomPower ? 1 : 0,
        channel: item.channel,
        tieLine: item.tieLine,
        cueBox: item.cueBox,
        preampId: item.preampId,
        preampText: item.preampText,
        polarityFlip: item.polarityFlip ? 1 : 0,
        notes: item.notes,
        color: item.color,
        groupId: item.groupId,
        sortOrder: index
      }
      let itemId: number
      if (typeof item.id === 'number' && existingIds.has(item.id)) {
        update.run({ ...params, id: item.id })
        itemId = item.id
        keepIds.add(item.id)
      } else {
        const info = insert.run(params)
        itemId = Number(info.lastInsertRowid)
        keepIds.add(itemId)
      }
      saveOutboards(itemId, item.outboards)
    })

    for (const id of existingIds) {
      if (!keepIds.has(id)) deleteStmt.run(id)
    }
  })
  replace()

  return listItemsBySetup(setupId)
}

/**
 * Duplicates every item from one setup into another — used by template instantiation and
 * "save as template." Layout Mode blocks are intentionally never copied (templates aren't
 * placed on a room layout — Layout Mode is fully independent of the setup-sheet structure).
 *
 * When `blankRoomSpecificFields` is set (saving a setup AS a template), the specific mic,
 * outboard, preamp, channel, tie line, cue box, and notes are dropped — those are tied to one
 * room's actual gear/patching on one day, not to the reusable structure of the template.
 * Only instrument type and source name (e.g. "Kick In", "Snare Top") carry over.
 * Instantiating a template back into a setup copies it as-is (already blank on those fields).
 */
export function copyItemsToSetup(
  sourceSetupId: number,
  targetSetupId: number,
  options: { blankRoomSpecificFields?: boolean } = {}
): void {
  const db = getDb()
  const items = listItemsBySetup(sourceSetupId)
  const insert = db.prepare(
    `INSERT INTO setup_items
      (setup_id, instrument_type, source_name, mic_id, mic_text, phantom_power, channel, tie_line, cue_box, preamp_id, preamp_text, polarity_flip, notes, color, group_id)
     VALUES (@setupId, @instrumentType, @sourceName, @micId, @micText, @phantomPower, @channel, @tieLine, @cueBox, @preampId, @preampText, @polarityFlip, @notes, @color, @groupId)`
  )
  const insertOutboard = db.prepare(
    `INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id, outboard_text)
     VALUES (?, ?, ?, ?)`
  )

  const copy = db.transaction(() => {
    items.forEach((item) => {
      const info = insert.run({
        setupId: targetSetupId,
        instrumentType: item.instrumentType,
        sourceName: item.sourceName,
        micId: options.blankRoomSpecificFields ? null : item.micId,
        micText: options.blankRoomSpecificFields ? null : item.micText,
        phantomPower: options.blankRoomSpecificFields ? 0 : item.phantomPower ? 1 : 0,
        channel: options.blankRoomSpecificFields ? null : item.channel,
        tieLine: options.blankRoomSpecificFields ? null : item.tieLine,
        cueBox: options.blankRoomSpecificFields ? null : item.cueBox,
        preampId: options.blankRoomSpecificFields ? null : item.preampId,
        preampText: options.blankRoomSpecificFields ? null : item.preampText,
        polarityFlip: options.blankRoomSpecificFields ? 0 : item.polarityFlip ? 1 : 0,
        notes: options.blankRoomSpecificFields ? null : item.notes,
        color: options.blankRoomSpecificFields ? null : item.color,
        groupId: options.blankRoomSpecificFields ? null : item.groupId
      })
      if (!options.blankRoomSpecificFields) {
        const newItemId = Number(info.lastInsertRowid)
        for (const slot of item.outboards) {
          if (slot.outboardId == null && !slot.outboardText) continue
          insertOutboard.run(newItemId, slot.slotIndex, slot.outboardId, slot.outboardText)
        }
      }
    })
  })
  copy()
}
