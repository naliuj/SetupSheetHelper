// Adds custom_instrument_types (Layout Mode user-created canvas block types) — additive,
// no rebuild needed since it's a brand new table.
//
// Usage: node scripts/migrate_custom_instrument_types.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/migrate_custom_instrument_types.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Migrating: ${dbPath}`)

const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_instrument_types (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    shape       TEXT NOT NULL CHECK (shape IN ('rect', 'circle')),
    color       TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'Custom',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_instrument_types_category ON custom_instrument_types(category, sort_order, label)`)

console.log('--- custom_instrument_types columns ---')
console.log(db.prepare('PRAGMA table_info(custom_instrument_types)').all().map((c) => c.name))
console.log('row count:', db.prepare('SELECT COUNT(*) c FROM custom_instrument_types').get().c)

db.close()
console.log('done')
