import type Database from 'better-sqlite3'

/** Row order for setup_items was never persisted (always ORDER BY id) — this adds a
 *  sort_order column so Table Mode's drag-to-reorder survives a reload. Also replaces the
 *  old hand-typed "Preset" system (presets/preset_items — confirmed empty on the live DB and
 *  unreachable from the app's own navigation, i.e. dead code) with Channel Presets, which
 *  capture real rows from a live setup by mic/outboard name+manufacturer (portable across
 *  studios — a raw mic_id/outboard_id FK would only resolve within the studio it was
 *  captured from) rather than the old system's free-text mic name only, no-outboard shape. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setup_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')

  // Backfill sort_order from existing row order (previously implicit via id) so current
  // setups don't all collapse to sort_order=0 and lose their visual order on next load.
  const rows = db.prepare('SELECT id, setup_id FROM setup_items ORDER BY setup_id, id').all() as {
    id: number
    setup_id: number
  }[]
  const update = db.prepare('UPDATE setup_items SET sort_order = ? WHERE id = ?')
  const counters = new Map<number, number>()
  for (const row of rows) {
    const next = counters.get(row.setup_id) ?? 0
    update.run(next, row.id)
    counters.set(row.setup_id, next + 1)
  }

  db.exec('DROP TABLE IF EXISTS preset_items')
  db.exec('DROP TABLE IF EXISTS presets')

  db.exec(`
    CREATE TABLE channel_presets (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL UNIQUE,
      description  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE channel_preset_items (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      preset_id             INTEGER NOT NULL REFERENCES channel_presets(id) ON DELETE CASCADE,
      sort_order            INTEGER NOT NULL DEFAULT 0,
      instrument_type       TEXT NOT NULL,
      source_name           TEXT NOT NULL,
      mic_name              TEXT,
      mic_manufacturer      TEXT,
      outboard_name         TEXT,
      outboard_manufacturer TEXT,
      channel               INTEGER,
      tie_line              INTEGER,
      cue_box               INTEGER,
      polarity_flip         INTEGER,
      notes                 TEXT
    )
  `)
  db.exec('CREATE INDEX idx_channel_preset_items_preset ON channel_preset_items(preset_id)')
}
