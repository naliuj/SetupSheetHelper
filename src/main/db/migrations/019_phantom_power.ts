import type Database from 'better-sqlite3'

/** Per-row Phantom Power flag — mirrors polarity_flip (a plain boolean column, toggled from its
 *  own table cell, between Mic and Outboard in column order). */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setup_items ADD COLUMN phantom_power INTEGER NOT NULL DEFAULT 0')
}
