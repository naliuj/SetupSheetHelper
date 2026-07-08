// Rebuilds `mics` and `outboard_gear` to add a 'setup' pool_type (per-session borrowed
// gear) plus a nullable setup_id column on both — same temp-table-swap procedure as
// migrate_personal_gear_locker.cjs, since SQLite can't alter a CHECK constraint in place.
//
// Usage: node scripts/migrate_setup_gear_locker.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/migrate_setup_gear_locker.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Migrating: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = OFF')

const migrate = db.transaction(() => {
  db.exec(`
    CREATE TABLE mics_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_type    TEXT NOT NULL CHECK (pool_type IN ('studio', 'building', 'faculty_reserve', 'personal', 'setup')),
      studio_id    INTEGER REFERENCES studios(id) ON DELETE CASCADE,
      building_id  INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
      setup_id     INTEGER REFERENCES setups(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      manufacturer TEXT,
      category     TEXT,
      notes        TEXT,
      quantity     INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      CHECK (
        (pool_type = 'studio' AND studio_id IS NOT NULL AND building_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'building' AND building_id IS NOT NULL AND studio_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'faculty_reserve' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'personal' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'setup' AND setup_id IS NOT NULL AND studio_id IS NULL AND building_id IS NULL)
      )
    )
  `)
  db.exec(`
    INSERT INTO mics_new (id, pool_type, studio_id, building_id, setup_id, name, manufacturer, category, notes, quantity, sort_order)
    SELECT id, pool_type, studio_id, building_id, NULL, name, manufacturer, category, notes, quantity, sort_order FROM mics
  `)
  db.exec(`DROP TABLE mics`)
  db.exec(`ALTER TABLE mics_new RENAME TO mics`)
  db.exec(`CREATE INDEX idx_mics_studio ON mics(studio_id)`)
  db.exec(`CREATE INDEX idx_mics_building ON mics(building_id)`)
  db.exec(`CREATE INDEX idx_mics_setup ON mics(setup_id)`)

  db.exec(`
    CREATE TABLE outboard_gear_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_type    TEXT NOT NULL DEFAULT 'studio' CHECK (pool_type IN ('studio', 'personal', 'setup')),
      studio_id    INTEGER REFERENCES studios(id) ON DELETE CASCADE,
      setup_id     INTEGER REFERENCES setups(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      manufacturer TEXT,
      category     TEXT,
      notes        TEXT,
      quantity     INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      CHECK (
        (pool_type = 'studio' AND studio_id IS NOT NULL AND setup_id IS NULL) OR
        (pool_type = 'personal' AND studio_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'setup' AND setup_id IS NOT NULL AND studio_id IS NULL)
      ),
      UNIQUE(studio_id, name)
    )
  `)
  db.exec(`
    INSERT INTO outboard_gear_new (id, pool_type, studio_id, setup_id, name, manufacturer, category, notes, quantity, sort_order)
    SELECT id, pool_type, studio_id, NULL, name, manufacturer, category, notes, quantity, sort_order FROM outboard_gear
  `)
  db.exec(`DROP TABLE outboard_gear`)
  db.exec(`ALTER TABLE outboard_gear_new RENAME TO outboard_gear`)
  db.exec(`CREATE INDEX idx_outboard_studio ON outboard_gear(studio_id)`)
  db.exec(`CREATE INDEX idx_outboard_setup ON outboard_gear(setup_id)`)
})

migrate()

const fkIssues = db.pragma('foreign_key_check')
if (fkIssues.length > 0) {
  console.error('foreign_key_check FAILED:', fkIssues)
  process.exit(1)
}

db.pragma('foreign_keys = ON')

console.log('--- mics columns ---')
console.log(db.prepare('PRAGMA table_info(mics)').all().map((c) => c.name))
console.log('--- outboard_gear columns ---')
console.log(db.prepare('PRAGMA table_info(outboard_gear)').all().map((c) => c.name))
console.log('mics count:', db.prepare('SELECT COUNT(*) c FROM mics').get().c)
console.log('outboard_gear count:', db.prepare('SELECT COUNT(*) c FROM outboard_gear').get().c)

db.close()
console.log('done')
