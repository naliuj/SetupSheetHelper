import type Database from 'better-sqlite3'

/** Free-typed text notes on the Layout Mode floor plan. A note is a room_layout_blocks row with
 *  kind = 'note', so it inherits everything a block already has — selection, drag, rotate, undo,
 *  autosave, and the copy made when a setup is duplicated — instead of living in a second table
 *  that every one of those paths would have to learn about.
 *
 *  A note keeps shape = 'rect': the table's CHECK (shape IN ('rect','circle')) can't be widened
 *  without rebuilding the table, and nothing about a note needs a third shape. Its text is `label`,
 *  its fill is `color` ('transparent' for plain text on the plan), and label_color works as it does
 *  for blocks. The two new style columns only mean anything on a note.
 *
 *  Defaults make every existing row a block exactly as before. Plain ALTERs, so the same statements
 *  serve a fresh database and an upgrade. */
export function run(db: Database.Database): void {
  db.exec(`ALTER TABLE room_layout_blocks ADD COLUMN kind TEXT NOT NULL DEFAULT 'block'`)
  db.exec('ALTER TABLE room_layout_blocks ADD COLUMN font_size REAL')
  db.exec('ALTER TABLE room_layout_blocks ADD COLUMN font_bold INTEGER NOT NULL DEFAULT 0')
}
