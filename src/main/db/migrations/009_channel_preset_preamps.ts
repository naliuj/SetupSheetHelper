import type Database from 'better-sqlite3'

/** Channel Presets (migration 005) predate the preamp system (migration 008), so
 *  channel_preset_items never got columns to capture a row's preamp selection — presets
 *  silently dropped it on apply. Adds the same name+manufacturer capture already used for
 *  mic/outboard. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE channel_preset_items ADD COLUMN preamp_name TEXT')
  db.exec('ALTER TABLE channel_preset_items ADD COLUMN preamp_manufacturer TEXT')
}
