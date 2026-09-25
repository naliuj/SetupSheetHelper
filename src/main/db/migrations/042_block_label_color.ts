import type Database from 'better-sqlite3'

/** Optional label text color for Layout Mode blocks, and a default for palette items that is
 *  copied onto a block when it is dropped. NULL in either means Auto: the label keeps choosing
 *  black or white from its fill, exactly as before — so every existing block and palette item
 *  renders unchanged until someone picks a color.
 *
 *  Plain nullable ALTERs, so the same statements serve a fresh database (where this runs after
 *  001_init.sql) and an upgrade. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE room_layout_blocks ADD COLUMN label_color TEXT')
  db.exec('ALTER TABLE palette_items ADD COLUMN label_color TEXT')
}
