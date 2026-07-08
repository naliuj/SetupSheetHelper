import type Database from 'better-sqlite3'

/** Frozen copy of the pre-redesign instrumentTypes.ts roster, used only to resolve historical
 *  setup_items.instrument_type values during the one-time backfill below. Deliberately NOT
 *  imported from the live src/shared/constants/instrumentTypes.ts, since that file's roster
 *  changes as part of this same migration (e.g. 'kick_drum' no longer exists there afterward). */
const LEGACY_TYPES: Record<string, { label: string; shape: 'rect' | 'circle'; color: string }> = {
  vocal_mic: { label: 'Vocal Mic', shape: 'circle', color: '#e6738f' },
  talkback_mic: { label: 'Talkback Mic', shape: 'circle', color: '#e6738f' },
  kick_drum: { label: 'Kick Drum', shape: 'rect', color: '#4f7cac' },
  snare: { label: 'Snare', shape: 'rect', color: '#4f7cac' },
  rack_tom: { label: 'Rack Tom', shape: 'rect', color: '#4f7cac' },
  floor_tom: { label: 'Floor Tom', shape: 'rect', color: '#4f7cac' },
  overhead: { label: 'Overhead', shape: 'circle', color: '#4f7cac' },
  hi_hat: { label: 'Hi-Hat', shape: 'circle', color: '#4f7cac' },
  guitar_amp: { label: 'Guitar Amp', shape: 'rect', color: '#f2a541' },
  bass_amp: { label: 'Bass Amp', shape: 'rect', color: '#f2a541' },
  keys: { label: 'Keys / Piano', shape: 'rect', color: '#8a6fbf' },
  di_box: { label: 'DI Box', shape: 'rect', color: '#5fb49c' },
  music_stand: { label: 'Music Stand', shape: 'rect', color: '#9aa5b1' },
  player: { label: 'Player', shape: 'circle', color: '#6c7ba0' }
}

function resolveLegacy(instrumentType: string): { label: string; shape: 'rect' | 'circle'; color: string } {
  return LEGACY_TYPES[instrumentType] ?? { label: instrumentType, shape: 'rect', color: '#9aa5b1' }
}

interface LegacyItemRow {
  id: number
  setup_id: number
  instrument_type: string
  x: number
  y: number
  rotation: number
  scale: number
  z_index: number
}

/** Divorces Layout Mode from Table Mode: creates the fully independent room_layout_blocks
 *  table, migrates any setup_items rows that were ever actually placed via a Layout Mode
 *  drag (instrument_type != 'custom_source', the row-type tag every Table-Mode "+ Add Source"
 *  row carries) into it, then drops the now-dead canvas columns from setup_items and removes
 *  the (confirmed empty) custom_instrument_types table — custom blocks are one-off from here
 *  on, never persisted to a shared catalog. */
export function run(db: Database.Database): void {
  // Fresh installs get room_layout_blocks (and setup_items already missing the canvas
  // columns) straight from 001_init.sql, so there's nothing left for this migration to do —
  // it only matters for DBs created before this migration existed.
  const alreadyMigrated = db
    .prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'room_layout_blocks'`)
    .get() as { c: number }
  if (alreadyMigrated.c > 0) return

  db.exec(`
    CREATE TABLE room_layout_blocks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      setup_id    INTEGER NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      shape       TEXT NOT NULL CHECK (shape IN ('rect', 'circle')),
      color       TEXT NOT NULL,
      x           REAL NOT NULL,
      y           REAL NOT NULL,
      width       REAL NOT NULL DEFAULT 44,
      height      REAL NOT NULL DEFAULT 44,
      rotation    REAL NOT NULL DEFAULT 0,
      z_index     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec('CREATE INDEX idx_room_layout_blocks_setup ON room_layout_blocks(setup_id)')

  const legacyRows = db
    .prepare(
      `SELECT id, setup_id, instrument_type, x, y, rotation, scale, z_index
       FROM setup_items WHERE instrument_type != 'custom_source'`
    )
    .all() as LegacyItemRow[]

  const insertBlock = db.prepare(
    `INSERT INTO room_layout_blocks (setup_id, label, shape, color, x, y, width, height, rotation, z_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const row of legacyRows) {
    const def = resolveLegacy(row.instrument_type)
    const size = 44 * (row.scale || 1)
    insertBlock.run(row.setup_id, def.label, def.shape, def.color, row.x, row.y, size, size, row.rotation, row.z_index)
  }

  // setup_items.instrument_type is Table Mode's row-type tag ('custom_source'), not a Layout
  // Mode concern — only the spatial/canvas columns get dropped.
  db.exec('ALTER TABLE setup_items DROP COLUMN x')
  db.exec('ALTER TABLE setup_items DROP COLUMN y')
  db.exec('ALTER TABLE setup_items DROP COLUMN rotation')
  db.exec('ALTER TABLE setup_items DROP COLUMN scale')
  db.exec('ALTER TABLE setup_items DROP COLUMN z_index')

  db.exec('DROP TABLE IF EXISTS custom_instrument_types')
}
