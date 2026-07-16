import type Database from 'better-sqlite3'

/** Per-setup layout override — lets a single setup use a blank sheet or its own imported layout
 *  file instead of (or in front of) the studio's shared `room_layout_files` row. One row per
 *  setup (UNIQUE, cascade-deleted with the setup). `kind = 'blank'` means "no file, just a blank
 *  sheet" (file_path/original_name/page_*_pt all NULL); `kind = 'file'` mirrors room_layout_files'
 *  file columns exactly, but is scoped to this setup only, never touching the studio's shared
 *  layout. Resolution order (see effectiveLayoutRepo.ts): this row wins over the studio's
 *  room_layout_files row when present. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE setup_layout_overrides (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      setup_id       INTEGER NOT NULL UNIQUE REFERENCES setups(id) ON DELETE CASCADE,
      kind           TEXT NOT NULL CHECK (kind IN ('blank', 'file')),
      file_path      TEXT,
      original_name  TEXT,
      page_width_pt  REAL,
      page_height_pt REAL,
      imported_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}
