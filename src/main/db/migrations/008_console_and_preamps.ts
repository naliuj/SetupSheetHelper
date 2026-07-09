import type Database from 'better-sqlite3'

/** Real Berklee studios always have a console (their setups use the existing free-text
 *  Channel column); custom studios often don't and patch through standalone preamps instead.
 *  has_console defaults to 1 so existing studios are unaffected. The preamps table mirrors
 *  outboard_gear's shape/CHECK style but narrowed to just the two pools that make sense for
 *  preamps (a studio's own locker, and a one-off borrowed unit for a single session) — no
 *  building/personal/faculty-reserve pools. channels plays the same role quantity plays for
 *  mics/outboard: how many times this exact unit can be picked across a setup's rows. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE studios ADD COLUMN has_console INTEGER NOT NULL DEFAULT 1')

  db.exec(`
    CREATE TABLE preamps (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_type    TEXT NOT NULL DEFAULT 'studio' CHECK (pool_type IN ('studio', 'setup')),
      studio_id    INTEGER REFERENCES studios(id) ON DELETE CASCADE,
      setup_id     INTEGER REFERENCES setups(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      manufacturer TEXT,
      category     TEXT,
      notes        TEXT,
      channels     INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      CHECK (
        (pool_type = 'studio' AND studio_id IS NOT NULL AND setup_id IS NULL) OR
        (pool_type = 'setup' AND setup_id IS NOT NULL AND studio_id IS NULL)
      ),
      UNIQUE(studio_id, name)
    )
  `)
  db.exec('CREATE INDEX idx_preamps_studio ON preamps(studio_id)')
  db.exec('CREATE INDEX idx_preamps_setup ON preamps(setup_id)')

  db.exec('ALTER TABLE setup_items ADD COLUMN preamp_id INTEGER REFERENCES preamps(id) ON DELETE SET NULL')
  db.exec('ALTER TABLE setup_items ADD COLUMN preamp_text TEXT')
}
