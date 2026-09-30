import type Database from 'better-sqlite3'

/** Drawing-tablet markup on the Layout Mode floor plan: pen and highlighter strokes, lines,
 *  arrows, ellipses and boxes. Like a text note (migration 044), a mark is a room_layout_blocks row
 *  — kind 'mark' — so it gets selection, drag, rotate, undo, autosave and setup duplication with
 *  no second table for each of those to learn about.
 *
 *  The block's x/y/width/height are the mark's bounding box, as for any block. What the mark IS —
 *  its tool, color, size and points — is one JSON column (MarkData in shared/types/setup.ts),
 *  because a stroke is a variable-length list of points and nothing ever queries inside it.
 *
 *  Nullable, so every existing row reads as it did. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE room_layout_blocks ADD COLUMN mark_data TEXT')
}
