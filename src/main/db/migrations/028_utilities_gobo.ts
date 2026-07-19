import type Database from 'better-sqlite3'

/** Adds a new built-in "Utilities" category to the Layout Palette with a single "Gobo" block — a
 *  tin-grey rectangle — pinned to the top of the palette.
 *
 *  Inserted here (not in INSTRUMENT_TYPES / migration 012, which already ran and is frozen) via
 *  INSERT OR IGNORE on instrument_key, so re-running is a no-op and a user who later hides, moves,
 *  recolors, or renames it isn't disturbed. sort_order is set one below the current minimum so the
 *  block sorts first, which puts "Utilities" at the top — category order derives from
 *  first-appearance in sort_order (see paletteGrouping.ts), there's no separate category ordering.
 *  The colour is a starting point; it's editable like any other block in Settings → Layout Palette. */
export function run(db: Database.Database): void {
  const min = (db.prepare('SELECT MIN(sort_order) AS m FROM palette_items').get() as { m: number | null }).m
  db.prepare(
    `INSERT OR IGNORE INTO palette_items (instrument_key, label, shape, color, category, is_builtin, is_hidden, sort_order)
     VALUES ('gobo', 'Gobo', 'rect', '#94a3b8', 'Utilities', 1, 0, ?)`
  ).run((min ?? 0) - 1)
}
