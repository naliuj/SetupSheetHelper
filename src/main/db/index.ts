import Database from 'better-sqlite3'
import { getDbPath } from '../userDataPaths'
import { runMigrations } from './migrate'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  return db
}
