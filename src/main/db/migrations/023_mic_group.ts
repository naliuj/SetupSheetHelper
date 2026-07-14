import type Database from 'better-sqlite3'

/** Links two or more setup_items into a mic group (e.g. a stereo pair or array) sharing a
 *  client-generated groupId. No separate role/label field — the existing per-row Notes column
 *  already covers that, so this is purely "these rows are linked" (drives the bracket visual +
 *  a one-time mic auto-fill convenience on link). Nullable; ungrouped rows (the default) are null. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setup_items ADD COLUMN group_id TEXT')
}
