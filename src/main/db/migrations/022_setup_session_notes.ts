import type Database from 'better-sqlite3'

/** Free-text session notes on a Setup (tuning reference, mic-array spacing, or anything else the
 *  user wants to jot down) — deliberately unstructured rather than split into separate fields.
 *  Nullable, defaults to no notes. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setups ADD COLUMN session_notes TEXT')
}
