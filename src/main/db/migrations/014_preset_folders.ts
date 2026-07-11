import type Database from 'better-sqlite3'

/** Channel Presets get their own folder namespace, deliberately separate from the `folders` table
 *  that organizes studios/setups — a session engineer's preset filing ("Drums", "Vocals") is a
 *  different organizational scheme from studio/setup folders. Mirrors the `folders` table (see
 *  001_init.sql), plus adds folder_id + sort_order to channel_presets for filing and drag-reorder. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE preset_folders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      parent_folder_id INTEGER REFERENCES preset_folders(id) ON DELETE CASCADE,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parent_folder_id, name)
    );
    CREATE INDEX idx_preset_folders_parent ON preset_folders(parent_folder_id);
    -- SQLite treats every NULL as distinct in a UNIQUE index, so the composite UNIQUE above does
    -- NOT stop two root-level folders (parent_folder_id IS NULL) from sharing a name — this
    -- partial index closes that gap (same as the folders table).
    CREATE UNIQUE INDEX idx_preset_folders_unique_root_name
      ON preset_folders(name) WHERE parent_folder_id IS NULL;
  `)

  db.exec('ALTER TABLE channel_presets ADD COLUMN folder_id INTEGER REFERENCES preset_folders(id) ON DELETE SET NULL')
  db.exec('ALTER TABLE channel_presets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
}
