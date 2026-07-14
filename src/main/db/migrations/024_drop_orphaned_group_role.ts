import type Database from 'better-sqlite3'

/** Cleans up the orphaned `group_role` column left on setup_items by an earlier, since-abandoned
 *  design (a separate role/label field for mic groups) — the mic-group feature only needs
 *  group_id now, with the existing Notes field covering any labeling. Guarded by a column-exists
 *  check since fresh installs never had it (only DBs that ran the old migration do). */
export function run(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(setup_items)').all() as { name: string }[]
  if (cols.some((c) => c.name === 'group_role')) {
    db.exec('ALTER TABLE setup_items DROP COLUMN group_role')
  }
}
