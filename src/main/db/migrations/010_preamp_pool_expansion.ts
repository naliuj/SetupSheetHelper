import type Database from 'better-sqlite3'

/** Preamps only ever supported 'studio' | 'setup' pool types, deliberately narrower than
 *  mics/outboard's full 5-pool system. For full gear-locker consistency, preamps now get the
 *  same 'building' | 'personal' | 'faculty_reserve' pools too. SQLite can't ALTER a CHECK
 *  constraint, so this rebuilds the table with the wider constraint and a new building_id
 *  column, mirroring outboard_gear's 004_outboard_building_faculty_pools.ts migration exactly.
 *  Rows/ids are preserved so existing setup_items.preamp_id references keep resolving
 *  correctly. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE preamps_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_type    TEXT NOT NULL DEFAULT 'studio' CHECK (pool_type IN ('studio', 'building', 'faculty_reserve', 'personal', 'setup')),
      studio_id    INTEGER REFERENCES studios(id) ON DELETE CASCADE,
      building_id  INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
      setup_id     INTEGER REFERENCES setups(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      manufacturer TEXT,
      category     TEXT,
      notes        TEXT,
      channels     INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      CHECK (
        (pool_type = 'studio' AND studio_id IS NOT NULL AND building_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'building' AND building_id IS NOT NULL AND studio_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'faculty_reserve' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'personal' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
        (pool_type = 'setup' AND setup_id IS NOT NULL AND studio_id IS NULL AND building_id IS NULL)
      ),
      UNIQUE(studio_id, name)
    )
  `)
  db.exec(`
    INSERT INTO preamps_new (id, pool_type, studio_id, building_id, setup_id, name, manufacturer, category, notes, channels, sort_order)
    SELECT id, pool_type, studio_id, NULL, setup_id, name, manufacturer, category, notes, channels, sort_order FROM preamps
  `)
  db.exec('DROP TABLE preamps')
  db.exec('ALTER TABLE preamps_new RENAME TO preamps')
  db.exec('CREATE INDEX idx_preamps_studio ON preamps(studio_id)')
  db.exec('CREATE INDEX idx_preamps_building ON preamps(building_id)')
  db.exec('CREATE INDEX idx_preamps_setup ON preamps(setup_id)')
}
