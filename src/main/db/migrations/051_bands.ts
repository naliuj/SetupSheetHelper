import type Database from 'better-sqlite3'

/** Several bands in one setup sheet. A band starts at a divider row (instrument_type
 *  'band_divider'; its source_name is the band name and notes the band notes), so the rows
 *  themselves need only two new columns:
 *
 *  start_time: free text ("7:00 pm"), used on divider rows only.
 *  copy_key: a client-generated id shared by a row and every copy "Next band" made of it, so a
 *  later band's row knows which earlier row it is, even after a rename, a channel change or a drag.
 *
 *  NULL in both is what every existing row reads as: a sheet without dividers is one band, as
 *  before. Plain nullable ALTERs, so the same statements serve fresh installs and upgrades. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setup_items ADD COLUMN start_time TEXT')
  db.exec('ALTER TABLE setup_items ADD COLUMN copy_key TEXT')
}
