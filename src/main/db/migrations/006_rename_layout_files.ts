import type Database from 'better-sqlite3'

/** Room layouts are no longer PDF-only (images are now accepted too), so the table name is
 *  renamed to stop implying otherwise. Pure rename, no data/shape change — SQLite supports this
 *  natively. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE room_layout_pdfs RENAME TO room_layout_files')
}
