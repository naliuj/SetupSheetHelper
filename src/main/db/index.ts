import Database from 'better-sqlite3'
import { getDbPath } from '../userDataPaths'
import { runMigrations } from './migrate'

let db: Database.Database | null = null

/** Remembered so a failed open is not retried on every subsequent IPC call. Each retry would
 *  re-run migrations against a database we already know is in a bad state, and the user would
 *  get the same failure a hundred times over instead of once. */
let openError: Error | null = null

export function getDb(): Database.Database {
  if (db) return db
  if (openError) throw openError

  const dbPath = getDbPath()
  const opened = new Database(dbPath)
  opened.pragma('journal_mode = WAL')
  opened.pragma('foreign_keys = ON')
  // WAL lets a reader and a writer coexist, but two writers still collide — and better-sqlite3
  // throws SQLITE_BUSY instantly by default, straight into renderer code that mostly does not
  // catch. Wait for the other writer instead. The single-instance lock in main/index.ts makes
  // this rare; the maintenance scripts in scripts/ can still open the same file.
  opened.pragma('busy_timeout = 5000')

  try {
    runMigrations(opened, dbPath)
  } catch (err) {
    // Assign `db` only once migrations have actually succeeded. Caching the connection first
    // meant a migration failure left every later call returning a HALF-MIGRATED database: the
    // app carried on reading columns that did not exist yet, saves failed silently, and the user
    // saw an empty Home screen indistinguishable from having lost everything.
    opened.close()
    openError = err instanceof Error ? err : new Error(String(err))
    throw openError
  }

  db = opened
  return db
}

/** Opens the database eagerly so a failure surfaces at startup, where it can be shown, rather
 *  than inside whatever IPC call happens to be first — most of which have no catch. Returns the
 *  error instead of throwing so the caller decides how to present it. */
export function openDatabaseAtStartup(): Error | null {
  try {
    getDb()
    return null
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

/** Closes the connection, which checkpoints the WAL back into the main database file. Without
 *  this the -wal file survives every quit, and anything reading the .sqlite on its own (a backup
 *  tool, one of the scripts) sees a database missing the most recent writes. */
export function closeDb(): void {
  if (!db) return
  try {
    db.close()
  } catch (err) {
    console.error('[db] close failed:', err)
  } finally {
    db = null
  }
}
