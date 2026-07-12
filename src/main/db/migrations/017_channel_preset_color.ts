import type Database from 'better-sqlite3'

/** Channel Presets can now capture a row's color (the swatch tint added in migration 015), so a
 *  saved preset restores the same color grouping when applied. Nullable — presets saved before
 *  this, or with Color left unchecked at save time, simply have no color. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE channel_preset_items ADD COLUMN color TEXT')
}
