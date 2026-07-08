import type Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations/index'

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => (row as { version: number }).version)
  )

  for (const migration of MIGRATIONS.sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue

    const applyMigration = db.transaction(() => {
      if ('sql' in migration) db.exec(migration.sql)
      else migration.run(db)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
    })
    applyMigration()
  }
}
