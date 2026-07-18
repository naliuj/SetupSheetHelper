import type Database from 'better-sqlite3'

/** Bumps the gobo's default placed height from 20 to 30 (a slightly taller bar; width stays 120).
 *  Migration 029 set the height to 20 and has already run on installs, so this immutably follows up
 *  rather than editing 029. Targets instrument_key, so it applies whether 029 seeded height 20 on an
 *  existing install or does so just before this in the same fresh-install run. Only affects the
 *  palette default — blocks already placed on a layout keep their own size. */
export function run(db: Database.Database): void {
  db.prepare("UPDATE palette_items SET default_height = 30 WHERE instrument_key = 'gobo'").run()
}
