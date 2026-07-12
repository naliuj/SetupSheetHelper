import type Database from 'better-sqlite3'

/** Per-setup column visibility (which toggleable table columns a setup shows). Nullable JSON array
 *  of SetupColumnKey; null (pre-feature setups) means every column is shown. New setups snapshot
 *  the global default (app_settings `default_visible_columns`) at creation. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setups ADD COLUMN visible_columns TEXT')
}
