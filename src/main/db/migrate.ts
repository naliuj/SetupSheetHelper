import type Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS } from './migrations/index'

/** How many pre-migration snapshots to keep. Enough to walk back through a bad upgrade without
 *  the directory growing without bound — each one is a full copy of the database. */
const MAX_BACKUPS = 5

/** Snapshots the database before the first migration of a run touches it.
 *
 *  Each migration is individually transactional, so a failure cannot leave a half-applied
 *  migration. What it CAN leave is a database several migrations into a multi-migration upgrade,
 *  with no way back — and since a failure surfaces as an app that opens to an empty Home screen,
 *  the user cannot tell a migration fault from total data loss. A copy taken here is the
 *  difference between "restore this file" and "your work is gone".
 *
 *  VACUUM INTO rather than a file copy: it is a consistent snapshot taken through SQLite itself,
 *  so it is safe with WAL (a plain copy of the .sqlite file without its -wal is not).
 *
 *  Best-effort by design. A backup that cannot be written must not stop the app from starting —
 *  a full disk should not brick the database it is trying to protect. */
function backupBeforeMigrating(db: Database.Database, dbPath: string): void {
  try {
    const dir = join(dbPath, '..', 'backups')
    mkdirSync(dir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(dir, `pre-migration-${stamp}.sqlite`)
    if (existsSync(target)) return

    // VACUUM INTO cannot be prepared with a bound parameter, and the path is ours (userData +
    // an ISO timestamp), not user input.
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)

    const stale = readdirSync(dir)
      .filter((name) => name.startsWith('pre-migration-') && name.endsWith('.sqlite'))
      .map((name) => join(dir, name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      .slice(MAX_BACKUPS)
    for (const path of stale) rmSync(path, { force: true })
  } catch (err) {
    console.error('[db] pre-migration backup failed, continuing:', err)
  }
}

export function runMigrations(db: Database.Database, dbPath?: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => (row as { version: number }).version)
  )

  const pending = MIGRATIONS.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  // Only when there is actually something to apply — every launch of an up-to-date install would
  // otherwise pay for a full copy of the database it is not about to change.
  if (dbPath) backupBeforeMigrating(db, dbPath)

  for (const migration of pending) {
    const applyMigration = db.transaction(() => {
      if ('sql' in migration) db.exec(migration.sql)
      else migration.run(db)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
    })
    applyMigration()
  }
}
