import type Database from 'better-sqlite3'

/** Per-row color for the setup sheet — an optional hex string (from the fixed swatch palette)
 *  used to visually group rows (e.g. all drum inputs one color). Nullable, defaults to no color. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setup_items ADD COLUMN color TEXT')
}
