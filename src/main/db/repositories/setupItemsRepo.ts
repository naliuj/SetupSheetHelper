import type { SetupItem } from '@shared/types/setup'
import type { SetupItemInput } from '@shared/types/ipc'
import { getDb } from '../index'

interface SetupItemRow {
  id: number
  setup_id: number
  instrument_type: string
  source_name: string
  mic_id: number | null
  mic_text: string | null
  channel: number | null
  tie_line: number | null
  cue_box: number | null
  outboard_id: number | null
  outboard_text: string | null
  polarity_flip: number
  notes: string | null
  sort_order: number
}

function mapRow(row: SetupItemRow): SetupItem {
  return {
    id: row.id,
    setupId: row.setup_id,
    instrumentType: row.instrument_type,
    sourceName: row.source_name,
    micId: row.mic_id,
    micText: row.mic_text,
    channel: row.channel,
    tieLine: row.tie_line,
    cueBox: row.cue_box,
    outboardId: row.outboard_id,
    outboardText: row.outboard_text,
    polarityFlip: row.polarity_flip === 1,
    notes: row.notes
  }
}

export function listItemsBySetup(setupId: number): SetupItem[] {
  const rows = getDb()
    .prepare('SELECT * FROM setup_items WHERE setup_id = ? ORDER BY sort_order, id')
    .all(setupId) as SetupItemRow[]
  return rows.map(mapRow)
}

/**
 * Upserts all items for a setup in one transaction. Existing items (numeric `id` already
 * in the DB) are UPDATEd in place rather than deleted+reinserted, so their id stays stable
 * across autosaves — the renderer table keys each row on `item.id`, and a delete+reinsert
 * here used to hand every row a fresh AUTOINCREMENT id on every single save, forcing a full
 * remount of every row (and dropping whatever input had focus) each time autosave fired.
 * New items (client-generated string id, never saved before) are INSERTed. Items no longer
 * present in the incoming set (removed client-side) are deleted.
 */
export function replaceItemsForSetup(setupId: number, items: SetupItemInput[]): SetupItem[] {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO setup_items
      (setup_id, instrument_type, source_name, mic_id, mic_text, channel, tie_line, cue_box, outboard_id, outboard_text, polarity_flip, notes, sort_order)
     VALUES (@setupId, @instrumentType, @sourceName, @micId, @micText, @channel, @tieLine, @cueBox, @outboardId, @outboardText, @polarityFlip, @notes, @sortOrder)`
  )
  const update = db.prepare(
    `UPDATE setup_items SET
      instrument_type = @instrumentType, source_name = @sourceName, mic_id = @micId, mic_text = @micText,
      channel = @channel, tie_line = @tieLine, cue_box = @cueBox, outboard_id = @outboardId,
      outboard_text = @outboardText, polarity_flip = @polarityFlip, notes = @notes, sort_order = @sortOrder,
      updated_at = datetime('now')
     WHERE id = @id AND setup_id = @setupId`
  )
  const deleteStmt = db.prepare('DELETE FROM setup_items WHERE id = ?')

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
        channel: item.channel,
        tieLine: item.tieLine,
        cueBox: item.cueBox,
        outboardId: item.outboardId,
        outboardText: item.outboardText,
        polarityFlip: item.polarityFlip ? 1 : 0,
        notes: item.notes,
        sortOrder: index
      }
      if (typeof item.id === 'number' && existingIds.has(item.id)) {
        update.run({ ...params, id: item.id })
        keepIds.add(item.id)
      } else {
        const info = insert.run(params)
        keepIds.add(Number(info.lastInsertRowid))
      }
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
 * outboard, channel, tie line, cue box, and notes are dropped — those are tied to one
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
      (setup_id, instrument_type, source_name, mic_id, mic_text, channel, tie_line, cue_box, outboard_id, outboard_text, polarity_flip, notes)
     VALUES (@setupId, @instrumentType, @sourceName, @micId, @micText, @channel, @tieLine, @cueBox, @outboardId, @outboardText, @polarityFlip, @notes)`
  )

  const copy = db.transaction(() => {
    items.forEach((item) => {
      insert.run({
        setupId: targetSetupId,
        instrumentType: item.instrumentType,
        sourceName: item.sourceName,
        micId: options.blankRoomSpecificFields ? null : item.micId,
        micText: options.blankRoomSpecificFields ? null : item.micText,
        channel: options.blankRoomSpecificFields ? null : item.channel,
        tieLine: options.blankRoomSpecificFields ? null : item.tieLine,
        cueBox: options.blankRoomSpecificFields ? null : item.cueBox,
        outboardId: options.blankRoomSpecificFields ? null : item.outboardId,
        outboardText: options.blankRoomSpecificFields ? null : item.outboardText,
        polarityFlip: options.blankRoomSpecificFields ? 0 : item.polarityFlip ? 1 : 0,
        notes: options.blankRoomSpecificFields ? null : item.notes
      })
    })
  })
  copy()
}
