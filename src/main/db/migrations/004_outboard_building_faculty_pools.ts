import type Database from 'better-sqlite3'

/** Outboard gear only ever supported 'studio' | 'personal' | 'setup' pool types — mics already
 *  had 'building' (a building's shared office stock) and 'faculty_reserve' (Berklee-only,
 *  opt-in) but outboard never got the same treatment. SQLite can't ALTER a CHECK constraint,
 *  so this rebuilds the table with the wider constraint and a new building_id column, mirroring
 *  the mics table exactly. Rows/ids are preserved so existing setup_items.outboard_id
 *  references keep resolving correctly. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE outboard_gear_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_type    TEXT NOT NULL DEFAULT 'studio' CHECK (pool_type IN ('studio', 'building', 'faculty_reserve', 'personal', 'setup')),
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
      ),
      UNIQUE(studio_id, name)
    )
  `)
  db.exec(`
    INSERT INTO outboard_gear_new (id, pool_type, studio_id, building_id, setup_id, name, manufacturer, category, notes, quantity, sort_order)
    SELECT id, pool_type, studio_id, NULL, setup_id, name, manufacturer, category, notes, quantity, sort_order FROM outboard_gear
  `)
  db.exec('DROP TABLE outboard_gear')
  db.exec('ALTER TABLE outboard_gear_new RENAME TO outboard_gear')
  db.exec('CREATE INDEX idx_outboard_studio ON outboard_gear(studio_id)')
  db.exec('CREATE INDEX idx_outboard_building ON outboard_gear(building_id)')
  db.exec('CREATE INDEX idx_outboard_setup ON outboard_gear(setup_id)')
}
