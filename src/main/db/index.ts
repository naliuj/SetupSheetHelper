import Database from 'better-sqlite3'
import { getDbPath } from '../userDataPaths'
import { runMigrations } from './migrate'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // WAL lets a reader and a writer coexist, but two writers still collide — and better-sqlite3
  // throws SQLITE_BUSY instantly by default, straight into renderer code that mostly does not
  // catch. Wait for the other writer instead. The single-instance lock in main/index.ts makes
  // this rare; the maintenance scripts in scripts/ can still open the same file.
  db.pragma('busy_timeout = 5000')
  runMigrations(db)

  return db
}
