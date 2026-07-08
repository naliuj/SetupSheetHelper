// Manual dry-run/verification companion to the in-app versioned migration
// src/main/db/migrations/003_room_layout_blocks.ts — run this against a COPY of the live DB
// first to sanity-check row counts/values before trusting the automatic in-app migration
// (which runs for real the next time the app launches, tracked via schema_migrations).
//
// Mirrors 003_room_layout_blocks.ts's run(db) logic exactly.
//
// Usage: node scripts/migrate_room_layout_blocks.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/migrate_room_layout_blocks.cjs <path-to-sqlite-file>')
  process.exit(1)
}

const LEGACY_TYPES = {
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

function resolveLegacy(instrumentType) {
  return LEGACY_TYPES[instrumentType] || { label: instrumentType, shape: 'rect', color: '#9aa5b1' }
}

console.log(`Migrating: ${dbPath}`)

const db = new Database(dbPath)

const migrate = db.transaction(() => {
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
    .all()

  const insertBlock = db.prepare(
    `INSERT INTO room_layout_blocks (setup_id, label, shape, color, x, y, width, height, rotation, z_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const row of legacyRows) {
    const def = resolveLegacy(row.instrument_type)
    const size = 44 * (row.scale || 1)
    insertBlock.run(row.setup_id, def.label, def.shape, def.color, row.x, row.y, size, size, row.rotation, row.z_index)
  }

  db.exec('ALTER TABLE setup_items DROP COLUMN x')
  db.exec('ALTER TABLE setup_items DROP COLUMN y')
  db.exec('ALTER TABLE setup_items DROP COLUMN rotation')
  db.exec('ALTER TABLE setup_items DROP COLUMN scale')
  db.exec('ALTER TABLE setup_items DROP COLUMN z_index')

  db.exec('DROP TABLE IF EXISTS custom_instrument_types')

  return legacyRows.length
})

const migratedCount = migrate()

const fkIssues = db.pragma('foreign_key_check')
if (fkIssues.length > 0) {
  console.error('foreign_key_check FAILED:', fkIssues)
  process.exit(1)
}

console.log(`Migrated ${migratedCount} legacy layout item(s) into room_layout_blocks.`)
console.log('--- room_layout_blocks ---')
console.log(db.prepare('SELECT * FROM room_layout_blocks').all())
console.log('--- setup_items columns (should NOT include x/y/rotation/scale/z_index) ---')
console.log(db.prepare('PRAGMA table_info(setup_items)').all().map((c) => c.name))
console.log('--- custom_instrument_types exists? ---')
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_instrument_types'").get())

db.close()
console.log('done')
