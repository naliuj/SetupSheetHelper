import type Database from 'better-sqlite3'

/** A gobo is a long, thin bar on the floor plan, so it shouldn't drop in at the standard square
 *  default size. */
const GOBO_WIDTH = 120
const GOBO_HEIGHT = 20

/** Two related follow-ups to migration 028 (which introduced the "Gobo" block):
 *
 *  1. Palette blocks gain an optional default placed size (default_width/default_height). When a
 *     block is dragged onto the layout, these seed the new block's width/height; NULL falls back to
 *     the standard square default (see layoutStore.addBlock's DEFAULT_SIZE). Only the gobo sets
 *     them for now.
 *
 *  2. 028 put the gobo in its own "Utilities" category pinned to the top. Fold it into the existing
 *     "Utility" category instead, give it its long-thin default size, and append it (MAX+1
 *     sort_order) so "Utility" keeps its normal position rather than jumping to the top. Targeting
 *     instrument_key means this both relocates an already-seeded gobo (installs that ran 028) and
 *     is a harmless no-op re-set on fresh installs (where 028 then this run in sequence). */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE palette_items ADD COLUMN default_width REAL')
  db.exec('ALTER TABLE palette_items ADD COLUMN default_height REAL')

  const maxSort = (db.prepare('SELECT MAX(sort_order) AS m FROM palette_items').get() as { m: number | null }).m
  db.prepare(
    `UPDATE palette_items
       SET category = 'Utility', default_width = ?, default_height = ?, sort_order = ?
     WHERE instrument_key = 'gobo'`
  ).run(GOBO_WIDTH, GOBO_HEIGHT, (maxSort ?? 0) + 1)
}
