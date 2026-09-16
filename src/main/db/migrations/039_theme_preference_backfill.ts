import type Database from 'better-sqlite3'
import type { MigrationContext } from '../migrate'

/** Pins the appearance of every profile that predates the Light / Dark / Follow-OS selector.
 *
 *  No schema change. Before this release the theme setting held 'light' or 'dark', and ABSENT
 *  meant dark — the renderer store simply initialized to dark and only overwrote itself if a row
 *  existed. The selector adds 'system' and makes absent mean 'system', which is right for a new
 *  install and wrong for everyone else: an existing user who never opened Settings would have
 *  their app change appearance on update, unasked.
 *
 *  So: on an upgrade, write the dark they have been looking at all along. On a fresh profile,
 *  write nothing and let absence mean Follow OS. `INSERT OR IGNORE` leaves an explicit 'light' or
 *  'dark' exactly as the user chose it.
 *
 *  Numbered 39: 32/33 were burned by the abandoned Multi Setup feature, 34-38 are taken. */
export function run(db: Database.Database, ctx: MigrationContext): void {
  if (ctx.freshDatabase) return
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theme', 'dark')`).run()
}
