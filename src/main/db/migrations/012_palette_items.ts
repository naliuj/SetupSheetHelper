import type Database from 'better-sqlite3'
import { INSTRUMENT_TYPES } from '@shared/constants/instrumentTypes'

/** The Layout Mode instrument palette becomes user-editable (reorder, add custom entries,
 *  hide built-ins) and lives in the DB from here on — INSTRUMENT_TYPES now only serves as the
 *  one-time seed source for this table.
 *
 *  instrument_key uniquely identifies a built-in row (matches InstrumentTypeDef.id); it's NULL
 *  for user-added customs (which never collide, never get re-seeded). INSERT OR IGNORE on that
 *  key makes this migration idempotent/safe to leave in the chain permanently — a future
 *  migration adding new built-ins to INSTRUMENT_TYPES would seed just the new keys without
 *  disturbing anything a user has already customized.
 *
 *  Built-in removal is soft (is_hidden), not a hard delete — avoids a future app update that
 *  reintroduces the same instrument_key silently un-hiding something the user deliberately
 *  removed. Custom items can be hard-deleted freely.
 *
 *  sort_order is one flat integer across the whole palette (not per-category) — category
 *  grouping is a view concern layered on top by the renderer, matching how this app already
 *  treats RoomLayoutBlock.zIndex and SetupItem.sortOrder as flat orderings. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE palette_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_key TEXT UNIQUE,
      label          TEXT NOT NULL,
      shape          TEXT NOT NULL CHECK (shape IN ('rect', 'circle')),
      color          TEXT NOT NULL,
      category       TEXT NOT NULL,
      is_builtin     INTEGER NOT NULL DEFAULT 0,
      is_hidden      INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec('CREATE INDEX idx_palette_items_sort ON palette_items(sort_order)')

  const insert = db.prepare(
    `INSERT OR IGNORE INTO palette_items (instrument_key, label, shape, color, category, is_builtin, sort_order)
     VALUES (@instrumentKey, @label, @shape, @color, @category, 1, @sortOrder)`
  )
  const seed = db.transaction(() => {
    INSTRUMENT_TYPES.forEach((item, index) => {
      insert.run({
        instrumentKey: item.id,
        label: item.label,
        shape: item.shape,
        color: item.color,
        category: item.category,
        sortOrder: index
      })
    })
  })
  seed()
}
