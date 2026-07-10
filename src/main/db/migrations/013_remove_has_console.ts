import type Database from 'better-sqlite3'

/** The console/no-console distinction never gated anything meaningful — the setup sheet's
 *  Preamp column and every pool's preamp queries already worked identically either way. Every
 *  studio now gets a working Preamps locker; engineers who don't need it just leave it empty. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE studios DROP COLUMN has_console')
}
