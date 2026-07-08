CREATE TABLE buildings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User-created groupings — nestable via parent_folder_id. Only used to organize custom
-- (buildingless) studios, custom studio templates, and saved setups; buildings already
-- group the real Berklee studios. Names only need to be unique among siblings.
CREATE TABLE folders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  parent_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_folder_id, name)
);
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
-- SQLite treats every NULL as distinct in a UNIQUE index, so the composite UNIQUE above does
-- NOT stop two root-level folders (parent_folder_id IS NULL) from sharing a name — this partial
-- index closes that gap.
CREATE UNIQUE INDEX idx_folders_unique_root_name ON folders(name) WHERE parent_folder_id IS NULL;

-- building_id is only set for real Berklee studios (browsed by building on the home
-- screen); custom studios created via "+ New Studio" have building_id NULL and are
-- optionally organized into a folder instead.
CREATE TABLE studios (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id              INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  folder_id                INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  name                     TEXT NOT NULL,
  is_temporary             INTEGER NOT NULL DEFAULT 0,
  faculty_reserve_enabled  INTEGER NOT NULL DEFAULT 0,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(building_id, name)
);
CREATE INDEX idx_studios_building ON studios(building_id);
CREATE INDEX idx_studios_folder ON studios(folder_id);

CREATE TABLE room_layout_pdfs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  studio_id     INTEGER NOT NULL UNIQUE REFERENCES studios(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,
  original_name TEXT,
  page_width_pt  REAL,
  page_height_pt REAL,
  imported_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- pool_type: 'studio' (this studio's own locker), 'building' (shared pool for all
-- studios in a building, e.g. a building office's mics), 'faculty_reserve' (one
-- global pool, gated behind an app setting since students can't access it),
-- 'personal' (one global pool, owned by the app's user, always visible/unconditional
-- unlike faculty_reserve — the "Personal Gear Locker"), or 'setup' (scoped to one
-- specific setup/session, e.g. borrowed gear used just for that recording — never
-- visible in any other setup).
CREATE TABLE mics (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_type    TEXT NOT NULL CHECK (pool_type IN ('studio', 'building', 'faculty_reserve', 'personal', 'setup')),
  studio_id    INTEGER REFERENCES studios(id) ON DELETE CASCADE,
  building_id  INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  setup_id     INTEGER REFERENCES setups(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  manufacturer TEXT,
  category     TEXT,
  notes        TEXT,
  quantity     INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  CHECK (
    (pool_type = 'studio' AND studio_id IS NOT NULL AND building_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'building' AND building_id IS NOT NULL AND studio_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'faculty_reserve' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'personal' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'setup' AND setup_id IS NOT NULL AND studio_id IS NULL AND building_id IS NULL)
  )
);
CREATE INDEX idx_mics_studio ON mics(studio_id);
CREATE INDEX idx_mics_building ON mics(building_id);
CREATE INDEX idx_mics_setup ON mics(setup_id);

-- pool_type: 'studio' (tied to exactly one studio, the original/default shape),
-- 'personal' (the global "Personal Gear Locker", studio_id NULL, always visible), or
-- 'setup' (scoped to one specific setup/session, e.g. borrowed gear for that recording).
CREATE TABLE outboard_gear (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_type    TEXT NOT NULL DEFAULT 'studio' CHECK (pool_type IN ('studio', 'building', 'faculty_reserve', 'personal', 'setup')),
  studio_id    INTEGER REFERENCES studios(id) ON DELETE CASCADE,
  building_id  INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  setup_id     INTEGER REFERENCES setups(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  manufacturer TEXT,
  category     TEXT,
  notes        TEXT,
  quantity     INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  CHECK (
    (pool_type = 'studio' AND studio_id IS NOT NULL AND building_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'building' AND building_id IS NOT NULL AND studio_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'faculty_reserve' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'personal' AND studio_id IS NULL AND building_id IS NULL AND setup_id IS NULL) OR
    (pool_type = 'setup' AND setup_id IS NOT NULL AND studio_id IS NULL AND building_id IS NULL)
  ),
  UNIQUE(studio_id, name)
);
CREATE INDEX idx_outboard_studio ON outboard_gear(studio_id);
CREATE INDEX idx_outboard_building ON outboard_gear(building_id);
CREATE INDEX idx_outboard_setup ON outboard_gear(setup_id);

-- Channel Presets capture real rows from a live setup (mic/outboard by name+manufacturer,
-- portable across studios — a raw mic_id/outboard_id FK would only resolve within the studio
-- it was captured from) for reuse in a different session/studio.
CREATE TABLE channel_presets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE channel_preset_items (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id             INTEGER NOT NULL REFERENCES channel_presets(id) ON DELETE CASCADE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  instrument_type       TEXT NOT NULL,
  source_name           TEXT NOT NULL,
  mic_name              TEXT,
  mic_manufacturer      TEXT,
  outboard_name         TEXT,
  outboard_manufacturer TEXT,
  channel               INTEGER,
  tie_line              INTEGER,
  cue_box               INTEGER,
  polarity_flip         INTEGER,
  notes                 TEXT
);
CREATE INDEX idx_channel_preset_items_preset ON channel_preset_items(preset_id);

-- kind: 'setup' is a normal in-progress/completed session. 'template' is a studio-bound
-- reusable starting point (Berklee-provided or user-saved) that gets duplicated into a
-- fresh 'setup' row when selected from the home screen; template_source distinguishes
-- the two template origins and must be null for plain setups. folder_id only applies to
-- 'custom' templates (user-organized); deleting a folder ungroups its templates.
CREATE TABLE setups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  studio_id       INTEGER NOT NULL REFERENCES studios(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  session_date    TEXT,
  engineer        TEXT,
  artist          TEXT,
  kind            TEXT NOT NULL DEFAULT 'setup' CHECK (kind IN ('setup', 'template')),
  template_source TEXT CHECK (template_source IN ('berklee', 'custom') OR template_source IS NULL),
  folder_id       INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (kind = 'template' AND template_source IS NOT NULL) OR
    (kind = 'setup' AND template_source IS NULL)
  )
);
CREATE INDEX idx_setups_studio ON setups(studio_id);
CREATE INDEX idx_setups_kind ON setups(kind, template_source);

-- instrument_type is a Table-Mode row-type tag (always 'custom_source' for a "+ Add Source"
-- row today) — NOT related to Layout Mode. Layout Mode is fully independent; see
-- room_layout_blocks below. This table has no spatial/canvas columns.
CREATE TABLE setup_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  setup_id       INTEGER NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  instrument_type TEXT NOT NULL,
  source_name    TEXT NOT NULL DEFAULT '',
  mic_id         INTEGER REFERENCES mics(id) ON DELETE SET NULL,
  mic_text       TEXT,
  channel        INTEGER,
  tie_line       INTEGER,
  cue_box        INTEGER,
  outboard_id    INTEGER REFERENCES outboard_gear(id) ON DELETE SET NULL,
  outboard_text  TEXT,
  polarity_flip  INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_setupitems_setup ON setup_items(setup_id);

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Layout Mode's canvas blocks — a purely spatial "where does everyone stand" visualization,
-- entirely independent of setup_items/Table Mode (no FK to it, no shared fields beyond
-- setup_id for scoping). label/shape/color are copied in at creation time (from a palette
-- drag or the one-off custom-block prompt) rather than referencing a shared catalog, so a
-- block is always self-contained and can never be orphaned by a catalog change.
CREATE TABLE room_layout_blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  setup_id    INTEGER NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  shape       TEXT NOT NULL CHECK (shape IN ('rect', 'circle')),
  color       TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  width       REAL NOT NULL DEFAULT 44,
  height      REAL NOT NULL DEFAULT 44,
  rotation    REAL NOT NULL DEFAULT 0,
  z_index     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_room_layout_blocks_setup ON room_layout_blocks(setup_id);
