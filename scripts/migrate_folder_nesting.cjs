// Rebuilds `folders` to add parent_folder_id (nesting) and scope name-uniqueness to siblings
// (SQLite can't alter a UNIQUE constraint or add a self-FK in place — same temp-table-swap
// procedure as migrate_personal_gear_locker.cjs). Also adds sort_order to `studios` and
// `setups` via plain additive ALTER TABLE ADD COLUMN (no rebuild needed for those).
//
// Usage: node scripts/migrate_folder_nesting.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/migrate_folder_nesting.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Migrating: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = OFF')

const migrate = db.transaction(() => {
  db.exec(`
    CREATE TABLE folders_new (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      parent_folder_id INTEGER REFERENCES folders_new(id) ON DELETE CASCADE,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parent_folder_id, name)
    )
  `)
  db.exec(`INSERT INTO folders_new (id, name, parent_folder_id, created_at) SELECT id, name, NULL, created_at FROM folders`)
  db.exec(`DROP TABLE folders`)
  db.exec(`ALTER TABLE folders_new RENAME TO folders`)
  db.exec(`CREATE INDEX idx_folders_parent ON folders(parent_folder_id)`)
  db.exec(`CREATE UNIQUE INDEX idx_folders_unique_root_name ON folders(name) WHERE parent_folder_id IS NULL`)

  db.exec(`ALTER TABLE studios ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  db.exec(`ALTER TABLE setups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
})

migrate()

const fkIssues = db.pragma('foreign_key_check')
if (fkIssues.length > 0) {
  console.error('foreign_key_check FAILED:', fkIssues)
  process.exit(1)
}

db.pragma('foreign_keys = ON')

console.log('--- folders columns ---')
console.log(db.prepare('PRAGMA table_info(folders)').all().map((c) => c.name))
console.log('--- studios columns ---')
console.log(db.prepare('PRAGMA table_info(studios)').all().map((c) => c.name))
console.log('--- setups columns ---')
console.log(db.prepare('PRAGMA table_info(setups)').all().map((c) => c.name))
console.log('folders count:', db.prepare('SELECT COUNT(*) c FROM folders').get().c)
console.log('studios count:', db.prepare('SELECT COUNT(*) c FROM studios').get().c)
console.log('setups count:', db.prepare('SELECT COUNT(*) c FROM setups').get().c)

db.close()
console.log('done')
