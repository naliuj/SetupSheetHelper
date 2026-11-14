import type Database from 'better-sqlite3'

/** Stereo pairs in channel presets. A pair on the sheet is two adjacent rows sharing a groupId,
 *  but presets never captured it, so every pair came back as two unlinked rows. pair_key holds
 *  the saved rows' shared groupId; loading a preset mints a fresh groupId per distinct key.
 *
 *  NULL means unpaired, which is also what every preset saved before this reads as — those
 *  stay unlinked until re-saved. Plain nullable ALTER, so it serves fresh installs and upgrades. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE channel_preset_items ADD COLUMN pair_key TEXT')
}
