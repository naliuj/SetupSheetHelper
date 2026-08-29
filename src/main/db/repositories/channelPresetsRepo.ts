import type Database from 'better-sqlite3'
import type {
  ChannelPreset,
  ChannelPresetItem,
  ChannelPresetItemInput,
  ChannelPresetWithItems
} from '@shared/types/channelPreset'
import type { ChannelPresetCreateInput } from '@shared/types/ipc'
import { getDb } from '../index'

interface ChannelPresetRow {
  id: number
  name: string
  description: string | null
  folder_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

interface ChannelPresetItemRow {
  id: number
  preset_id: number
  sort_order: number
  instrument_type: string
  source_name: string
  mic_name: string | null
  mic_manufacturer: string | null
  outboard_name: string | null
  outboard_manufacturer: string | null
  preamp_name: string | null
  preamp_manufacturer: string | null
  channel: number | null
  tie_line: number | null
  /** Free text now ("1-2" stereo cues); legacy rows are integers via the column's INTEGER
   *  affinity — mapItem normalizes both to string. See setupItemsRepo's cue_box note. */
  cue_box: number | string | null
  polarity_flip: number | null
  notes: string | null
  color: string | null
}

function mapPreset(row: ChannelPresetRow): ChannelPreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    folderId: row.folder_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapItem(row: ChannelPresetItemRow): ChannelPresetItem {
  return {
    id: row.id,
    presetId: row.preset_id,
    sortOrder: row.sort_order,
    instrumentType: row.instrument_type,
    sourceName: row.source_name,
    micName: row.mic_name,
    micManufacturer: row.mic_manufacturer,
    outboardName: row.outboard_name,
    outboardManufacturer: row.outboard_manufacturer,
    preampName: row.preamp_name,
    preampManufacturer: row.preamp_manufacturer,
    channel: row.channel,
    tieLine: row.tie_line,
    cueBox: row.cue_box != null ? String(row.cue_box) : null,
    polarityFlip: row.polarity_flip == null ? null : row.polarity_flip === 1,
    notes: row.notes,
    color: row.color
  }
}

export function listChannelPresets(): ChannelPreset[] {
  const rows = getDb()
    .prepare('SELECT * FROM channel_presets ORDER BY sort_order, name')
    .all() as ChannelPresetRow[]
  return rows.map(mapPreset)
}

export function getChannelPresetWithItems(id: number): ChannelPresetWithItems | null {
  const row = getDb().prepare('SELECT * FROM channel_presets WHERE id = ?').get(id) as ChannelPresetRow | undefined
  if (!row) return null
  const items = getDb()
    .prepare('SELECT * FROM channel_preset_items WHERE preset_id = ? ORDER BY sort_order')
    .all(id) as ChannelPresetItemRow[]
  return { ...mapPreset(row), items: items.map(mapItem) }
}

function insertItems(db: Database.Database, presetId: number, items: ChannelPresetItemInput[]): void {
  const insert = db.prepare(
    `INSERT INTO channel_preset_items
      (preset_id, sort_order, instrument_type, source_name, mic_name, mic_manufacturer, outboard_name, outboard_manufacturer, preamp_name, preamp_manufacturer, channel, tie_line, cue_box, polarity_flip, notes, color)
     VALUES (@presetId, @sortOrder, @instrumentType, @sourceName, @micName, @micManufacturer, @outboardName, @outboardManufacturer, @preampName, @preampManufacturer, @channel, @tieLine, @cueBox, @polarityFlip, @notes, @color)`
  )
  items.forEach((item, index) => {
    insert.run({
      presetId,
      sortOrder: index,
      instrumentType: item.instrumentType,
      sourceName: item.sourceName,
      micName: item.micName,
      micManufacturer: item.micManufacturer,
      outboardName: item.outboardName,
      outboardManufacturer: item.outboardManufacturer,
      preampName: item.preampName,
      preampManufacturer: item.preampManufacturer,
      channel: item.channel,
      tieLine: item.tieLine,
      cueBox: item.cueBox,
      polarityFlip: item.polarityFlip == null ? null : item.polarityFlip ? 1 : 0,
      notes: item.notes,
      color: item.color
    })
  })
}

export function createChannelPreset(input: ChannelPresetCreateInput): ChannelPreset {
  const db = getDb()
  const create = db.transaction(() => {
    // New presets append to the end of the list (within their chosen folder, or the unfiled root).
    const maxSortOrder = (db.prepare('SELECT MAX(sort_order) m FROM channel_presets').get() as { m: number | null }).m
    const info = db
      .prepare('INSERT INTO channel_presets (name, description, folder_id, sort_order) VALUES (?, ?, ?, ?)')
      .run(input.name, input.description, input.folderId ?? null, (maxSortOrder ?? -1) + 1)
    const id = Number(info.lastInsertRowid)
    insertItems(db, id, input.items)
    return id
  })
  const id = create()
  const row = db.prepare('SELECT * FROM channel_presets WHERE id = ?').get(id) as ChannelPresetRow
  return mapPreset(row)
}

export function updateChannelPreset(id: number, input: ChannelPresetCreateInput): ChannelPreset {
  const db = getDb()
  const update = db.transaction(() => {
    db.prepare("UPDATE channel_presets SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(
      input.name,
      input.description,
      id
    )
    db.prepare('DELETE FROM channel_preset_items WHERE preset_id = ?').run(id)
    insertItems(db, id, input.items)
  })
  update()
  const row = db.prepare('SELECT * FROM channel_presets WHERE id = ?').get(id) as ChannelPresetRow
  return mapPreset(row)
}

export function removeChannelPreset(id: number): void {
  getDb().prepare('DELETE FROM channel_presets WHERE id = ?').run(id)
}

export function removeChannelPresets(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  getDb()
    .prepare(`DELETE FROM channel_presets WHERE id IN (${placeholders})`)
    .run(...ids)
}

/** Lightweight name/description edit — updates only those, without touching the captured items
 *  (unlike updateChannelPreset, which does a full item replace). */
export function renameChannelPreset(id: number, name: string, description: string | null): ChannelPreset {
  const db = getDb()
  db.prepare("UPDATE channel_presets SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(
    name,
    description,
    id
  )
  const row = db.prepare('SELECT * FROM channel_presets WHERE id = ?').get(id) as ChannelPresetRow
  return mapPreset(row)
}

/** Lightweight reparent for drag-to-folder — doesn't touch name/updated_at. */
export function movePresetToFolder(id: number, folderId: number | null): void {
  getDb().prepare('UPDATE channel_presets SET folder_id = ? WHERE id = ?').run(folderId, id)
}

/** Batch reorder within a folder — assigns sequential sort_order in the given id order. */
export function reorderPresets(ids: number[]): void {
  const db = getDb()
  const run = db.transaction(() => {
    const stmt = db.prepare('UPDATE channel_presets SET sort_order = ? WHERE id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  run()
}
