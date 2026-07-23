import type Database from 'better-sqlite3'

/** Per-setup memory of which editor mode (table/layout) it was last viewed in, so reopening a
 *  setup restores its own view instead of carrying over whatever mode another setup left behind.
 *  New setups get 'table' via the column default. */
export function run(db: Database.Database): void {
  db.exec("ALTER TABLE setups ADD COLUMN last_editor_mode TEXT NOT NULL DEFAULT 'table'")
}
