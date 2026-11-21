import type Database from 'better-sqlite3'

/** A row can be off in a band: still patched, unused for that band's set (shared/utils/bands.ts
 *  treats it as no changeover work). 0 is what every existing row reads as: on. A plain ALTER with
 *  a default, so the same statement serves fresh installs and upgrades. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setup_items ADD COLUMN inactive INTEGER NOT NULL DEFAULT 0')
}
