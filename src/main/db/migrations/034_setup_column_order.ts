import type Database from 'better-sqlite3'

/** Per-setup column ORDER, stored separately from column visibility (018) because it covers every
 *  column key, hidden ones included — that's what lets a re-shown column return to where the user
 *  dragged it. Nullable JSON array of SetupColumnKey; null (pre-feature setups) means the canonical
 *  order, so nothing changes for anyone until they actually reorder. New setups snapshot the global
 *  default (app_settings `default_column_order`) at creation. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setups ADD COLUMN column_order TEXT')
}
