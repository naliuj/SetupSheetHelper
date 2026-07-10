import type Database from 'better-sqlite3'

/** Outboard gear used to be exactly one column per row (outboard_id/outboard_text on
 *  setup_items). Users can now add more Outboard columns sheet-wide ("+ Add Outboard Column"),
 *  so a row can have any number of outboard slots. Modeled as a join table (this app's existing
 *  one-to-many pattern, e.g. channel_preset_items) rather than numbered columns — no arbitrary
 *  limit, and "+ Add Outboard Column" is a cheap O(1) bump to setups.outboard_column_count
 *  rather than an ALTER TABLE per click.
 *
 *  setup_items gets rebuilt without outboard_id/outboard_text (SQLite can't selectively drop
 *  columns from a table this old cleanly alongside other constraints, so this follows the same
 *  full-rebuild pattern already used by 004_outboard_building_faculty_pools.ts and
 *  010_preamp_pool_expansion.ts) — every existing row's outboard value is migrated into a
 *  slot_index=0 row in the new join table first, so nothing is lost. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE setup_item_outboards (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      setup_item_id  INTEGER NOT NULL REFERENCES setup_items(id) ON DELETE CASCADE,
      slot_index     INTEGER NOT NULL,
      outboard_id    INTEGER REFERENCES outboard_gear(id) ON DELETE SET NULL,
      outboard_text  TEXT,
      UNIQUE(setup_item_id, slot_index)
    )
  `)
  db.exec('CREATE INDEX idx_setup_item_outboards_item ON setup_item_outboards(setup_item_id)')

  db.exec(`
    INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id, outboard_text)
    SELECT id, 0, outboard_id, outboard_text FROM setup_items
    WHERE outboard_id IS NOT NULL OR outboard_text IS NOT NULL
  `)

  db.exec(`
    CREATE TABLE setup_items_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      setup_id       INTEGER NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
      instrument_type TEXT NOT NULL,
      source_name    TEXT NOT NULL DEFAULT '',
      mic_id         INTEGER REFERENCES mics(id) ON DELETE SET NULL,
      mic_text       TEXT,
      channel        INTEGER,
      tie_line       INTEGER,
      cue_box        INTEGER,
      polarity_flip  INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      preamp_id      INTEGER REFERENCES preamps(id) ON DELETE SET NULL,
      preamp_text    TEXT
    )
  `)
  db.exec(`
    INSERT INTO setup_items_new (id, setup_id, instrument_type, source_name, mic_id, mic_text, channel, tie_line, cue_box, polarity_flip, notes, sort_order, created_at, updated_at, preamp_id, preamp_text)
    SELECT id, setup_id, instrument_type, source_name, mic_id, mic_text, channel, tie_line, cue_box, polarity_flip, notes, sort_order, created_at, updated_at, preamp_id, preamp_text FROM setup_items
  `)
  db.exec('DROP TABLE setup_items')
  db.exec('ALTER TABLE setup_items_new RENAME TO setup_items')
  db.exec('CREATE INDEX idx_setupitems_setup ON setup_items(setup_id)')

  db.exec('ALTER TABLE setups ADD COLUMN outboard_column_count INTEGER NOT NULL DEFAULT 1')
}
