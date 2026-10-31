import type Database from 'better-sqlite3'
import { attachBundledPatchbays } from '../bundledPatchbays'

/** Patchbay Mode: one patchbay drawing per studio (like room_layout_files) and the cables drawn on
 *  it per setup.
 *
 *  `points_json` caches the jacks detected on the drawing (see detectPatchPoints.ts) and
 *  `points_version` the detector version that produced them; NULL means "not detected yet", filled
 *  in on first load. Cable ends are room-pixel positions plus, when they snapped to a jack, that
 *  jack's id — so a cable survives a re-detection that renames jacks.
 *
 *  Installs that already loaded the Berklee studios get the bundled drawings attached here; new
 *  installs get them from the Berklee seed. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE patchbay_files (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      studio_id      INTEGER NOT NULL UNIQUE REFERENCES studios(id) ON DELETE CASCADE,
      file_path      TEXT NOT NULL,
      original_name  TEXT,
      page_width_pt  REAL NOT NULL,
      page_height_pt REAL NOT NULL,
      points_json    TEXT,
      points_version INTEGER,
      imported_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE patchbay_cables (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      setup_id    INTEGER NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
      from_x      REAL NOT NULL,
      from_y      REAL NOT NULL,
      to_x        REAL NOT NULL,
      to_y        REAL NOT NULL,
      from_point  TEXT,
      to_point    TEXT,
      color       TEXT NOT NULL,
      sag         REAL NOT NULL DEFAULT 0.35,
      z_index     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_patchbay_cables_setup ON patchbay_cables(setup_id);
  `)
  attachBundledPatchbays(db)
}
