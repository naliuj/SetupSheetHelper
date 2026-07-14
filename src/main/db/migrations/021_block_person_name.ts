import type Database from 'better-sqlite3'

/** Optional musician name on a Layout Mode block, so the canvas can double as a seating chart
 *  (e.g. "Violin 1" label + "Maria K." person name) — blank for ordinary gear blocks. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE room_layout_blocks ADD COLUMN person_name TEXT')
}
